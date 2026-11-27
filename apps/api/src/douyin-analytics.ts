import {
  isSocialPlatform,
  socialPlatforms,
  SocialOneApiProvider,
  type SocialProfile,
} from "./social-oneapi.js";
import {
  metricSource,
  nextDailySync,
  nextOneApiRetry,
  oneapiEnabled,
  videoSyncLimit,
} from "./oneapi.js";
import {
  templateTagBindings,
  matchVideoTags,
  videoTagBinding,
} from "./template-tag-bindings.js";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { summarizeVideoMetrics, sumKnown } from "./analytics-summary.js";
import {
  collectionLog,
  collectionErrorDetails,
  withCollectionContext,
  updateCollectionContext,
} from "./collection-log.js";
import {
  accountWindowMetrics,
  videoWindowMetrics,
  videoDailyViews,
} from "./douyin-metrics.js";
import { SessionGuard, type AuthRequest } from "./auth.js";
import { hasPermission, permissionsFor } from "./permissions.js";
import { DouyinService } from "./douyin.js";
import { douyinConfig } from "./douyin-provider.js";
import { decryptToken } from "./oauth-crypto.js";
import {
  bucketFor,
  DataProviderError,
  DouyinDataProvider,
  normalizeTrackingTag,
  shanghaiDate,
} from "./douyin-data-provider.js";
class DateQuery {
  @IsOptional() @IsIn(["all", ...socialPlatforms]) platform?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) start?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) end?: string;
  @IsOptional() @IsString() @Length(1, 100) accountId?: string;
  @IsOptional()
  @IsIn(["all", "brand", "personal_ip", "store_ip"])
  type?: string;
}
class TrackingTagDto {
  @IsString() @Length(1, 100) templateId!: string;
  @IsString() @Length(1, 101) tag!: string;
  @IsString() @Length(1, 30) version!: string;
}
function permission(req: AuthRequest, key: string) {
  if (!hasPermission(permissionsFor(req.user), key))
    throw new ForbiddenException("没有此操作权限");
}
export function dateRange(query: { start?: string; end?: string }) {
  const end = query.end || shanghaiDate(new Date());
  const start =
    query.start || shanghaiDate(new Date(Date.now() - 6 * 86400000));
  const first = new Date(`${start}T00:00:00+08:00`),
    last = new Date(`${end}T00:00:00+08:00`);
  if (
    !Number.isFinite(first.getTime()) ||
    !Number.isFinite(last.getTime()) ||
    shanghaiDate(first) !== start ||
    shanghaiDate(last) !== end ||
    last < first ||
    last.getTime() - first.getTime() > 30 * 86400000
  )
    throw new BadRequestException("请选择有效的北京时间日期范围，最多31天。");
  return { start, end, first, last: new Date(last.getTime() + 86400000) };
}
const terminalStates = [
  "quota_exhausted",
  "unsupported",
  "permission_required",
  "authorization_required",
  "invalid_response",
];
@Injectable()
export class DouyinAnalyticsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private discoveryCursor?: string;
  private retriesRecovered = false;
  private social = new SocialOneApiProvider();
  constructor(
    private db: Database,
    private source: DouyinDataProvider,
    private oauth: DouyinService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async status(org: string) {
    const accounts = await this.db.account.findMany({
      where: {
        organizationId: org,
        platform: oneapiEnabled() ? { in: [...socialPlatforms] } : "douyin",
      },
      include: { authorization: true, syncStates: true },
      orderBy: { bindTime: "desc" },
    });
    return accounts.map((a) => ({
      id: a.id,
      name: a.nickname,
      platform: a.platform,
      type: a.tier,
      mode:
        a.dataProvider === "oneapi"
          ? "oneapi"
          : a.authorization?.mode || "none",
      scopes: a.authorization?.scopes || [],
      states: ["videos", "fans"].map((kind) => {
        const saved = a.syncStates.find((s) => s.kind === kind);
        const reason = this.accountBlocked(a, kind);
        return {
          kind,
          status: reason ? "blocked" : saved?.status || "idle",
          message: reason || saved?.message || "等待同步",
          processed: saved?.processed || 0,
          cursorPending: !!saved && saved.cursor !== "0",
          lastSuccessAt: saved?.lastSuccessAt || null,
          lastAttemptAt: saved?.lastAttemptAt || null,
          nextAttemptAt: saved?.nextAttemptAt || null,
        };
      }),
    }));
  }
  private accountBlocked(
    account: {
      dataProfile?: string | null;
      dataProvider?: string | null;
      platform?: string;
      authorization?: any;
    },
    kind: string,
  ) {
    if (oneapiEnabled()) {
      if (account.platform && !isSocialPlatform(account.platform))
        return "不支持此平台采集";
      if (account.dataProvider !== "oneapi") {
        if (account.authorization?.mode !== "live")
          return "请先通过 OneAPI 查询并确认绑定账号。";
        if (account.authorization.refreshExpiresAt <= new Date())
          return "请重新通过 OneAPI 确认账号信息。";
      }
      if (!account.dataProfile) return "请添加平台用户 ID 或主页分享链接。";
      return this.social.availability();
    }
    return this.blocked(account.authorization ?? null, kind);
  }
  private blocked(
    auth: {
      mode: string;
      clientKey: string;
      scopes: string[];
      refreshExpiresAt: Date;
      accessTokenCiphertext: string | null;
      refreshTokenCiphertext: string | null;
    } | null,
    kind: string,
  ) {
    if (!auth || auth.mode !== "live")
      return "请先完成正式抖音账号授权，演示账号不能采集真实数据。";
    if (
      !auth.accessTokenCiphertext ||
      !auth.refreshTokenCiphertext ||
      auth.refreshExpiresAt <= new Date()
    )
      return "授权已失效，请重新授权。";
    const config = douyinConfig();
    if (!config.ready) return config.reason;
    if (auth.clientKey !== config.clientKey) return "应用已变更，请重新授权。";
    return this.source.availability(kind, auth.scopes);
  }
  async enqueue(org: string, accountId: string) {
    const account = await this.db.account.findFirst({
      where: {
        id: accountId,
        organizationId: org,
        platform: oneapiEnabled() ? { in: [...socialPlatforms] } : "douyin",
      },
      include: { authorization: true },
    });
    if (!account) throw new NotFoundException("账号不存在");
    for (const kind of ["videos", "fans"]) {
      const reason = this.accountBlocked(account, kind);
      await this.db.douyinSyncState.upsert({
        where: { accountId_kind: { accountId, kind } },
        create: {
          accountId,
          kind,
          status: reason ? "blocked" : "queued",
          message: reason || "已加入同步队列",
        },
        update: {},
      });
      const state = await this.db.douyinSyncState.findUniqueOrThrow({
        where: { accountId_kind: { accountId, kind } },
      });
      if (state.leaseUntil && state.leaseUntil > new Date()) continue;
      // Repeated clicks never bypass platform cooldown; failed terminal capabilities require explicit retry after configuration changes.
      if (
        !reason &&
        state.nextAttemptAt &&
        state.nextAttemptAt > new Date() &&
        (state.lastSuccessAt || state.failures > 0)
      )
        continue;
      await this.db.douyinSyncState.updateMany({
        where: {
          id: state.id,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          status: reason ? "blocked" : "queued",
          message: reason || "已加入同步队列",
          nextAttemptAt: null,
        },
      });
    }
    return this.status(org);
  }
  async initializeAccount(accountId: string) {
    // 复用定时任务的执行与租约机制，防止后台扫描和初始化重复采集。
    for (const kind of ["fans", "videos"]) {
      const state = await this.db.douyinSyncState.findUnique({
        where: { accountId_kind: { accountId, kind } },
      });
      if (state?.status === "queued") await this.run(state.id);
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      if (oneapiEnabled() && !this.retriesRecovered) {
        await this.recoverLegacyRetries(now);
        this.retriesRecovered = true;
      }
      // 显式启用能力后分页发现账号，每轮推进游标，避免只处理前一百个账号。
      if (
        oneapiEnabled() ||
        process.env.DOUYIN_FANS_SYNC_ENABLED === "true" ||
        process.env.DOUYIN_VIDEO_API_PROFILE === "website_v1"
      ) {
        const accounts = await this.db.account.findMany({
          where: {
            platform: oneapiEnabled() ? { in: [...socialPlatforms] } : "douyin",
            ...(oneapiEnabled()
              ? {
                  dataProfile: { not: null },
                  OR: [
                    { dataProvider: "oneapi" },
                    { authorization: { is: { mode: "live" } } },
                  ],
                }
              : { authorization: { is: { mode: "live" } } }),
            ...(this.discoveryCursor
              ? { id: { gt: this.discoveryCursor } }
              : {}),
          },
          include: { authorization: true },
          orderBy: { id: "asc" },
          take: 100,
        });
        for (const a of accounts)
          for (const kind of ["videos", "fans"])
            if (!this.accountBlocked(a, kind))
              await this.db.douyinSyncState.upsert({
                where: { accountId_kind: { accountId: a.id, kind } },
                create: {
                  accountId: a.id,
                  kind,
                  status: "queued",
                  ...(oneapiEnabled()
                    ? { nextAttemptAt: nextDailySync() }
                    : {}),
                },
                update: {},
              });
        this.discoveryCursor =
          accounts.length === 100 ? accounts.at(-1)!.id : undefined;
      }
      const states = await this.db.douyinSyncState.findMany({
        where: {
          OR: [
            { status: { notIn: terminalStates } },
            {
              account: {
                OR: [
                  { dataProvider: "oneapi" },
                  ...(oneapiEnabled()
                    ? [{ authorization: { is: { mode: "live" } } }]
                    : []),
                ],
              },
              nextAttemptAt: { lte: now },
            },
          ],
          AND: [
            { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
            { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          ],
        },
        orderBy: { updatedAt: "asc" },
        take: 10,
      });
      if (states.length)
        collectionLog("log", "social.scheduler.batch", {
          scheduled: states.length,
        });
      for (const state of states) {
        try {
          await this.run(state.id);
        } catch {
          // 具体错误已由账号任务记录，单个任务异常不能阻断其他账号。
        }
      }
    } catch (error) {
      collectionLog(
        "error",
        "social.scheduler.failed",
        collectionErrorDetails(error),
      );
    } finally {
      this.busy = false;
    }
  }
  async recoverLegacyRetries(now = new Date(), organizationId?: string) {
    let cursor: string | undefined;
    let recovered = 0;
    do {
      const rows = await this.db.douyinSyncState.findMany({
        where: {
          status: {
            in: [
              "network_error",
              "rate_limited",
              "platform_error",
              "failed",
              "superseded",
            ],
          },
          failures: { gt: 0 },
          lastAttemptAt: { not: null },
          nextAttemptAt: { gt: now },
          account: {
            ...(organizationId ? { organizationId } : {}),
            OR: [
              { dataProvider: "oneapi" },
              { authorization: { is: { mode: "live" } } },
            ],
          },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 100,
      });
      for (const row of rows) {
        // 仅迁移旧规则中直接排到次日零点的临时失败，不覆盖正常退避与正在执行的任务。
        if (
          row.nextAttemptAt?.getTime() !==
          nextDailySync(row.lastAttemptAt!).getTime()
        )
          continue;
        const nextAttemptAt = nextOneApiRetry(row.failures - 1, now);
        if (nextAttemptAt >= row.nextAttemptAt!) continue;
        const result = await this.db.douyinSyncState.updateMany({
          where: {
            id: row.id,
            status: row.status,
            failures: row.failures,
            nextAttemptAt: row.nextAttemptAt,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: { nextAttemptAt },
        });
        recovered += result.count;
      }
      cursor = rows.length === 100 ? rows.at(-1)!.id : undefined;
    } while (cursor);
    if (recovered)
      collectionLog("log", "social.scheduler.retries_recovered", { recovered });
    return recovered;
  }
  async run(id: string) {
    const runId = randomUUID();
    return withCollectionContext({ runId, stateId: id }, async () => {
      try {
        await this.runTask(id, runId);
      } catch (error) {
        collectionLog(
          "error",
          "social.task.unhandled",
          collectionErrorDetails(error),
        );
        throw error;
      }
    });
  }
  private async runTask(id: string, runId: string) {
    const now = new Date();
    const claimed = await this.db.douyinSyncState.updateMany({
      where: {
        id,
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        ],
      },
      data: {
        runId,
        leaseUntil: new Date(Date.now() + 600000),
        status: "running",
        lastAttemptAt: now,
        message: "正在同步",
      },
    });
    if (!claimed.count) return;
    const state = await this.db.douyinSyncState.findUniqueOrThrow({
      where: { id },
      include: { account: { include: { authorization: true } } },
    });
    updateCollectionContext({
      accountId: state.accountId,
      platform: state.account.platform,
      task: state.kind,
      phase: "prepare",
    });
    collectionLog("log", "social.task.started", { provider: metricSource() });
    let processed = 0;
    const settle = async (
      data: Prisma.DouyinSyncStateUpdateManyMutationInput,
    ) => {
      const result = await this.db.douyinSyncState.updateMany({
        where: { id, runId },
        data: { ...data, runId: null, leaseUntil: null },
      });
      const status = typeof data.status === "string" ? data.status : "unknown";
      collectionLog(
        !result.count || status !== "success" ? "warn" : "log",
        "social.task.finished",
        {
          status,
          persisted: result.count > 0,
          processed,
          durationMs: Date.now() - now.getTime(),
          nextAttemptAt:
            data.nextAttemptAt instanceof Date
              ? data.nextAttemptAt.toISOString()
              : null,
        },
      );
      return result;
    };
    try {
      const thirdParty = oneapiEnabled();
      const reason = this.accountBlocked(state.account, state.kind);
      if (reason) throw new DataProviderError("blocked", reason);
      let token = "";
      let credential = state.account.authorization;
      if (!thirdParty) {
        await this.oauth.refreshAccount(state.accountId);
        credential = await this.db.accountAuthorization.findUnique({
          where: { accountId: state.accountId },
        });
        const refreshedReason = this.blocked(credential, state.kind);
        if (refreshedReason || !credential?.accessTokenCiphertext)
          throw new DataProviderError(
            "authorization_required",
            refreshedReason || "请重新授权",
          );
        token = decryptToken(
          credential.accessTokenCiphertext,
          `douyin:${credential.clientKey}:${credential.openId}:access`,
        );
      }
      let secUid = state.account.dataSecUid;
      let uid = state.account.dataUid;
      let capturedAt = new Date();
      const transaction = async (
        write: (tx: Prisma.TransactionClient) => Promise<void>,
      ) =>
        this.db.$transaction(
          async (tx) => {
            const lease = await tx.douyinSyncState.updateMany({
              where: { id, runId, leaseUntil: { gt: new Date() } },
              data: { leaseUntil: new Date(Date.now() + 600000) },
            });
            if (!lease.count)
              throw new DataProviderError(
                "superseded",
                "同步租约已失效。",
                true,
              );
            const valid = thirdParty
              ? await tx.account.updateMany({
                  where: {
                    id: state.accountId,
                    organizationId: state.account.organizationId,
                    platform: state.account.platform,
                    dataProfile: state.account.dataProfile,
                    ...(state.account.dataProvider === "oneapi"
                      ? {
                          dataProvider: "oneapi",
                          dataRevision: state.account.dataRevision,
                        }
                      : {
                          authorization: {
                            is: {
                              mode: "live",
                              revision: credential!.revision,
                              refreshExpiresAt: { gt: new Date() },
                            },
                          },
                        }),
                  },
                  data: { updatedAt: new Date() },
                })
              : await tx.accountAuthorization.updateMany({
                  where: {
                    accountId: state.accountId,
                    revision: credential!.revision,
                    mode: "live",
                  },
                  data: { lastVerifiedAt: credential!.lastVerifiedAt },
                });
            if (!valid.count)
              throw new DataProviderError(
                "authorization_required",
                "账号配置在同步期间发生变化，请重新同步。",
              );
            await write(tx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      // 视频分页复用解析后的身份；粉丝任务每天刷新一次用户资料。
      let profile: SocialProfile | undefined;
      if (thirdParty && (state.kind === "fans" || !secUid || !uid)) {
        updateCollectionContext({ phase: "profile" });
        if (!isSocialPlatform(state.account.platform))
          throw new DataProviderError("unsupported", "不支持该平台");
        profile = await this.social.profile(
          state.account.platform,
          state.account.dataProfile!,
        );
        if (
          (secUid && profile.secUid !== secUid) ||
          (uid && profile.uid !== uid)
        )
          throw new DataProviderError(
            "invalid_response",
            "采集主页对应用户已变更，已停止同步。",
          );
        secUid = profile.secUid;
        uid = profile.uid;
        await transaction(async (tx) => {
          if (
            await tx.account.findFirst({
              where: {
                organizationId: state.account.organizationId,
                platform: state.account.platform,
                dataUid: uid,
                id: { not: state.accountId },
              },
              select: { id: true },
            })
          )
            throw new DataProviderError(
              "invalid_response",
              "该采集主页已绑定其他账号，请检查账号配置。",
            );
          await tx.account.update({
            where: { id: state.accountId },
            data: {
              dataSecUid: secUid,
              dataUid: uid,
              nickname: profile!.nickname,
              ...(profile!.avatar ? { avatar: profile!.avatar } : {}),
            },
          });
        });
      }
      if (state.kind === "fans") {
        updateCollectionContext({ phase: "fans" });
        const fans = thirdParty
          ? profile!.fans
          : await this.source.fans(token, credential!.openId);
        capturedAt = new Date();
        const bucket = bucketFor(capturedAt);
        await transaction(async (tx) => {
          await tx.accountMetricSample.upsert({
            where: { accountId_bucket: { accountId: state.accountId, bucket } },
            create: {
              accountId: state.accountId,
              bucket,
              capturedAt,
              fans,
              source: metricSource(),
            },
            update: { capturedAt, fans, source: metricSource() },
          });
        });
        processed = 1;
        await settle({
          status: "success",
          message: "已采集粉丝总量快照；历史净增需等待连续采集。",
          processed,
          failures: 0,
          lastSuccessAt: capturedAt,
          nextAttemptAt: nextDailySync(),
        });
      } else {
        updateCollectionContext({ phase: "videos" });
        if (state.cursor === "0")
          await this.db.douyinSyncState.updateMany({
            where: { id, runId },
            data: { processed: 0 },
          });
        const limit = videoSyncLimit();
        let total = state.cursor === "0" ? 0 : state.processed;
        let cursor = state.cursor,
          hasMore = total < limit,
          missing = false;
        for (let page = 0; page < 3 && hasMore; page++) {
          const result = thirdParty
            ? await this.social.videos(
                state.account
                  .platform as import("./social-oneapi.js").SocialPlatform,
                secUid!,
                uid!,
                cursor,
                limit - total,
              )
            : await this.source.videos(token, credential!.openId, cursor);
          // 到达上限后结束本轮，历史视频不再查询或更新指标。
          result.videos = result.videos
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, limit - total);
          total += result.videos.length;
          const continuePaging = result.hasMore && total < limit;
          capturedAt = new Date();
          const bucket = bucketFor(capturedAt);
          await transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.account.organizationId + ":tags"}))`;
            const bindings = await templateTagBindings(
              tx,
              state.account.organizationId,
            );
            for (const v of result.videos) {
              const prior = await tx.platformVideo.findUnique({
                where: {
                  accountId_remoteId: {
                    accountId: state.accountId,
                    remoteId: v.remoteId,
                  },
                },
                include: {
                  binding: true,
                  templateTagBinding: { include: { tag: true } },
                },
              });
              const priorBinding = prior ? videoTagBinding(prior) : null;
              const match =
                priorBinding && (!priorBinding.active || priorBinding.deletedAt)
                  ? {}
                  : matchVideoTags(v.tags, bindings);
              const video = await tx.platformVideo.upsert({
                where: {
                  accountId_remoteId: {
                    accountId: state.accountId,
                    remoteId: v.remoteId,
                  },
                },
                create: {
                  organizationId: state.account.organizationId,
                  accountId: state.accountId,
                  remoteId: v.remoteId,
                  source: metricSource(),
                  title: v.title,
                  ...(v.coverUrl ? { coverUrl: v.coverUrl } : {}),
                  tags: v.tags,
                  publishedAt: v.publishedAt,
                  lastSeenAt: capturedAt,
                  ...match,
                },
                update: {
                  source: metricSource(),
                  title: v.title,
                  ...(v.coverUrl ? { coverUrl: v.coverUrl } : {}),
                  tags: v.tags,
                  publishedAt: v.publishedAt,
                  lastSeenAt: capturedAt,
                  ...match,
                },
              });
              if (v.metrics)
                await tx.videoMetricSample.upsert({
                  where: { videoId_bucket: { videoId: video.id, bucket } },
                  create: {
                    videoId: video.id,
                    bucket,
                    capturedAt,
                    ...v.metrics,
                    source: metricSource(),
                  },
                  update: { capturedAt, ...v.metrics, source: metricSource() },
                });
              else missing = true;
            }
            await tx.douyinSyncState.updateMany({
              where: { id, runId },
              data: {
                cursor: continuePaging ? result.cursor : "0",
                processed: { increment: result.videos.length },
              },
            });
          });
          cursor = result.cursor;
          hasMore = continuePaging;
          processed += result.videos.length;
        }
        await settle({
          status: hasMore || missing ? "partial" : "success",
          message: hasMore
            ? "本批已保存，稍后从游标继续；列表未扫描完成。"
            : missing
              ? "列表已同步，部分视频暂无指标；保留历史快照。"
              : "视频与指标快照已同步。",
          ...(!hasMore ? { lastSuccessAt: capturedAt } : {}),
          ...(!hasMore ? { cursor: "0" } : {}),
          failures: 0,
          nextAttemptAt: hasMore
            ? new Date(Date.now() + 60000)
            : nextDailySync(),
        });
      }
    } catch (error) {
      const e =
        error instanceof DataProviderError
          ? error
          : new DataProviderError(
              "failed",
              "同步失败，已有数据已保留，稍后重试。",
              true,
            );
      collectionLog("error", "social.task.failed", {
        state: e.state,
        processed,
        durationMs: Date.now() - now.getTime(),
        ...collectionErrorDetails(error),
      });
      await settle({
        status: e.state,
        ...(oneapiEnabled() ? { cursor: "0" } : {}),
        message: e.message,
        failures: { increment: 1 },
        nextAttemptAt: oneapiEnabled()
          ? e.retryable
            ? nextOneApiRetry(state.failures)
            : nextDailySync()
          : terminalStates.includes(e.state)
            ? null
            : new Date(
                Date.now() +
                  (e.retryable
                    ? Math.min(
                        3600000,
                        60000 * 2 ** Math.min(state.failures, 6),
                      )
                    : 3600000),
              ),
      });
    }
  }
  async bindings(org: string) {
    return templateTagBindings(this.db, org, false);
  }
  async availableTags(org: string) {
    return this.db.templateTrackingTag.findMany({
      where: {
        organizationId: org,
        active: true,
        deletedAt: null,
        systemGenerated: false,
      },
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
    });
  }
  async addBinding(org: string, dto: TrackingTagDto) {
    const template = await this.db.template.findFirst({
      where: { id: dto.templateId, organizationId: org },
    });
    if (!template) throw new NotFoundException("模板不存在");
    let tag: string;
    try {
      tag = normalizeTrackingTag(dto.tag);
    } catch {
      throw new BadRequestException(
        "请输入有效的完整话题 tag，仅支持中英文、数字和下划线。",
      );
    }
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${org + ":tags"}))`;
      const existing = await tx.templateTrackingTag.findUnique({
        where: { organizationId_tag: { organizationId: org, tag } },
      });
      if (existing) {
        if (!existing.active || existing.deletedAt)
          throw new ConflictException(
            "标签已停用或删除，请先维护可用的发布标签。",
          );
        if (existing.templateId) {
          if (
            existing.templateId === dto.templateId &&
            existing.version === dto.version
          )
            return existing;
          throw new ConflictException(
            "该 tag 已绑定其他模板或版本，请使用新的唯一 tag。",
          );
        }
        return tx.templateTrackingTag.update({
          where: { id: existing.id },
          data: {
            templateId: template.id,
            version: dto.version,
            titleSnapshot: template.title,
          },
        });
      }
      return tx.templateTrackingTag.create({
        data: {
          organizationId: org,
          templateId: template.id,
          tag,
          code: "TAG_" + randomUUID().replaceAll("-", "").toUpperCase(),
          name: dto.tag.trim().replace(/^#/, ""),
          version: dto.version,
          titleSnapshot: template.title,
        },
      });
    });
  }

  async rematch(org: string) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${org + ":tags"}))`;
        const bindings = await templateTagBindings(tx, org);
        const videos = await tx.platformVideo.findMany({
          where: { organizationId: org, source: metricSource() },
          include: {
            binding: true,
            templateTagBinding: { include: { tag: true } },
          },
        });
        let processed = 0;
        for (const v of videos) {
          const priorBinding = videoTagBinding(v);
          if (priorBinding && (!priorBinding.active || priorBinding.deletedAt))
            continue;
          await tx.platformVideo.update({
            where: { id: v.id },
            data: matchVideoTags(v.tags, bindings),
          });
          processed++;
        }
        return { processed };
      },
      { timeout: 30000 },
    );
  }
  async overview(org: string, query: DateQuery) {
    const range = dateRange(query);
    const filter: Prisma.AccountWhereInput = {
      organizationId: org,
      platform: oneapiEnabled()
        ? query.platform && query.platform !== "all"
          ? query.platform
          : { in: [...socialPlatforms] }
        : "douyin",
      // 演示授权账号不参与真实数据中心的汇总。
      OR: [
        { dataProvider: "oneapi" },
        { NOT: { authorization: { is: { mode: "demo" } } } },
      ],
      ...(query.accountId && query.accountId !== "all"
        ? { id: query.accountId }
        : {}),
      ...(query.type && query.type !== "all" ? { tier: query.type } : {}),
    };
    const accounts = await this.db.account.findMany({
      where: filter,
      include: { store: true },
    });
    const count = await this.db.platformVideo.count({
      where: {
        organizationId: org,
        source: metricSource(),
        accountId: { in: accounts.map((a) => a.id) },
        publishedAt: { lt: range.last },
      },
    });
    if (count > 5000)
      throw new BadRequestException(
        "视频较多，请按账号筛选后查询（单次最多5000条）。",
      );
    const records = await this.db.platformVideo.findMany({
      where: {
        organizationId: org,
        source: metricSource(),
        accountId: { in: accounts.map((a) => a.id) },
        publishedAt: { lt: range.last },
      },
      include: {
        binding: true,
        templateTagBinding: { include: { tag: true } },
      },
      orderBy: { publishedAt: "desc" },
    });
    const [videoStats, fanStats] = await Promise.all([
      videoWindowMetrics(
        this.db,
        org,
        records.map((v) => v.id),
        range,
      ),
      accountWindowMetrics(
        this.db,
        org,
        accounts.map((a) => a.id),
        range,
      ),
    ]);
    const allBindings = await this.bindings(org);
    const canonical = new Map<string, (typeof allBindings)[number]>();
    for (const b of [...allBindings].sort((a, b) => a.id.localeCompare(b.id))) {
      const key = JSON.stringify([b.templateId, b.version]);
      if (!canonical.has(key)) canonical.set(key, b);
    }
    const videos = records
      .map((v) => {
        const binding = videoTagBinding(v);
        const window = videoStats.get(v.id);
        const fields = [
          "views",
          "likes",
          "comments",
          "shares",
          "collects",
        ] as const;
        const metrics = Object.fromEntries(
          fields.map((key) => [
            key,
            window?.[key] == null ? null : Number(window[key]),
          ]),
        ) as Record<(typeof fields)[number], number | null>;
        return {
          id: v.id,
          remoteId: v.remoteId,
          title: v.title,
          coverUrl: v.coverUrl,
          accountId: v.accountId,
          publishedAt: v.publishedAt,
          tags: v.tags,
          matchStatus: v.matchStatus,
          template: binding
            ? {
                id:
                  canonical.get(
                    JSON.stringify([binding.templateId, binding.version]),
                  )?.id || binding.id,
                templateId: binding.templateId,
                title: binding.titleSnapshot,
                version: binding.version,
                tag: binding.tag,
              }
            : null,
          metrics,
          capturedAt: window?.capturedAt || null,
          latest: window?.capturedAt
            ? Object.fromEntries(
                fields.map((key) => [
                  key,
                  window[`latest_${key}`] == null
                    ? null
                    : Number(window[`latest_${key}`]),
                ]),
              )
            : null,
        };
      })
      .filter(
        (v) =>
          v.publishedAt >= range.first ||
          (v.capturedAt && v.capturedAt >= range.first),
      );
    // 预先分组，避免每个账号和模板重复扫描全部视频。
    const byAccount = new Map<string, typeof videos>();
    const byTemplate = new Map<string, typeof videos>();
    for (const video of videos) {
      const accountRows = byAccount.get(video.accountId) || [];
      accountRows.push(video);
      byAccount.set(video.accountId, accountRows);
      if (video.template) {
        const templateRows = byTemplate.get(video.template.id) || [];
        templateRows.push(video);
        byTemplate.set(video.template.id, templateRows);
      }
    }
    const summary = summarizeVideoMetrics(videos);
    const accountRows = accounts.map((a) => {
      const window = fanStats.get(a.id);
      const own = byAccount.get(a.id) || [];
      return {
        id: a.id,
        name: a.nickname,
        platform: a.platform,
        type: a.tier,
        store: a.store?.name || null,
        published: own.filter((v) => v.publishedAt >= range.first).length,
        ...summarizeVideoMetrics(own),
        fans: window?.fans == null ? null : Number(window.fans),
        fansCapturedAt: window?.capturedAt || null,
        netFans: window?.netFans == null ? null : Number(window.netFans),
      };
    });
    const allAccounts =
      (!query.accountId || query.accountId === "all") &&
      (!query.type || query.type === "all") &&
      (!query.platform || query.platform === "all");
    const creationWhere = {
      organizationId: org,
      createdAt: { gte: range.first, lt: range.last },
    };
    const previousRange = {
      first: new Date(
        range.first.getTime() - (range.last.getTime() - range.first.getTime()),
      ),
      last: range.first,
    };
    const previousVideos = records.filter(
      (v) => v.publishedAt < previousRange.last,
    );
    const [
      trend,
      generated,
      pending,
      failed,
      previousVideoStats,
      previousFanStats,
      generatedByTemplate,
    ] = await Promise.all([
      videoDailyViews(
        this.db,
        org,
        records.map((v) => v.id),
        range,
      ),
      allAccounts
        ? this.db.work.count({
            where: { ...creationWhere, creationId: { not: null } },
          })
        : null,
      allAccounts
        ? this.db.videoCreationDraft.count({
            where: {
              ...creationWhere,
              status: { in: ["awaiting_provider", "queued", "generating"] },
            },
          })
        : null,
      allAccounts
        ? this.db.videoCreationDraft.count({
            where: { ...creationWhere, status: "failed" },
          })
        : null,
      videoWindowMetrics(
        this.db,
        org,
        previousVideos.map((v) => v.id),
        previousRange,
      ),
      accountWindowMetrics(
        this.db,
        org,
        accounts.map((a) => a.id),
        previousRange,
      ),
      allAccounts
        ? this.db.$queryRaw<
            { templateId: string; revision: number; count: number }[]
          >(Prisma.sql`
        SELECT c."templateId", c.revision, COUNT(w.id)::int AS count
        FROM "Work" w JOIN "VideoCreationDraft" c ON c.id=w."creationId"
        WHERE w."organizationId"=${org} AND c."organizationId"=${org}
          AND w."createdAt" >= ${range.first} AND w."createdAt" < ${range.last}
        GROUP BY c."templateId", c.revision
      `)
        : null,
    ]);
    const workCounts = new Map(
      (generatedByTemplate || []).map((row) => [
        JSON.stringify([row.templateId, `v${row.revision}`]),
        row.count,
      ]),
    );
    const bindings = [...canonical.values()];
    return {
      source: "live",
      content: {
        generated,
        pending,
        failed,
        publishedWorks: null,
        playedWorks: null,
        pendingPublish: null,
        trend,
        previous: {
          published: previousVideos.filter(
            (v) => v.publishedAt >= previousRange.first,
          ).length,
          views: sumKnown(
            [...previousVideoStats.values()].map((v) =>
              v.views == null ? null : Number(v.views),
            ),
          ),
          netFans: sumKnown(
            [...previousFanStats.values()].map((a) =>
              a.netFans == null ? null : Number(a.netFans),
            ),
          ),
        },
      },
      ...{ start: range.start, end: range.end },
      basis: oneapiEnabled()
        ? "OneAPI 多平台采集；每日北京时间 00:00 更新，区间增量按各平台快照计算。"
        : "采集快照观察增量；不等同于平台按自然日统计。首次采集缺少期初基线时显示—。粉丝来源可能含抖音极速版及火山。",
      accounts: accountRows,
      videos,
      summary: {
        ...summary.metrics,
        rates: summary.rates,
        metricCoverage: summary.metricCoverage,
        published: videos.filter((v) => v.publishedAt >= range.first).length,
        participating: accountRows.filter((a) => a.published > 0).length,
        fans: sumKnown(accountRows.map((a) => a.fans)),
        netFans: sumKnown(accountRows.map((a) => a.netFans)),
        videoCount: videos.length,
        measuredVideos: videos.filter((v) => v.metrics.views !== null).length,
        unmatched: videos.filter((v) => v.matchStatus === "unmatched").length,
        conflicts: videos.filter((v) => v.matchStatus === "conflict").length,
      },
      templates: bindings.map((b) => {
        const own = byTemplate.get(b.id) || [];
        const stats = summarizeVideoMetrics(own);
        const m = stats.metrics;
        return {
          id: b.id,
          templateId: b.templateId,
          title: b.titleSnapshot,
          version: b.version,
          tag: b.tag,
          works: allAccounts
            ? workCounts.get(JSON.stringify([b.templateId, b.version])) || 0
            : null,
          published: own.filter((v) => v.publishedAt >= range.first).length,
          videoCount: own.length,
          accounts: new Set(own.map((v) => v.accountId)).size,
          ...stats,
          average:
            stats.metricCoverage.views && m.views !== null
              ? Math.round(m.views / stats.metricCoverage.views)
              : null,
        };
      }),
      syncedAt:
        videos
          .map((v) => v.capturedAt)
          .filter((v): v is Date => !!v)
          .sort((a, b) => b.getTime() - a.getTime())[0] || null,
      trading: {
        status: "not_integrated",
        message: "生活服务订单与核销接口尚未接入，账号成交不分摊到视频或模板。",
      },
    };
  }
}
@Controller(["analytics/social", "analytics/douyin"])
@UseGuards(SessionGuard)
export class DouyinAnalyticsController {
  constructor(private service: DouyinAnalyticsService) {}
  @Get("status") status(@Req() req: AuthRequest) {
    permission(req, "analytics");
    return this.service.status(req.user.organizationId);
  }
  @Post("accounts/:id/sync") sync(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    permission(req, "analytics");
    permission(req, "accounts:write");
    if (oneapiEnabled())
      throw new BadRequestException("平台数据每天北京时间 0 点自动采集");
    return this.service.enqueue(req.user.organizationId, id);
  }
  @Get("overview") overview(
    @Req() req: AuthRequest,
    @Query() query: DateQuery,
  ) {
    permission(req, "analytics");
    return this.service.overview(req.user.organizationId, query);
  }
  @Get("tags") tags(@Req() req: AuthRequest) {
    permission(req, "analytics");
    return this.service.availableTags(req.user.organizationId);
  }
  @Post("tags") addTag(@Req() req: AuthRequest, @Body() dto: TrackingTagDto) {
    permission(req, "analytics");
    permission(req, "templates:write");
    return this.service.addBinding(req.user.organizationId, dto);
  }
  @Post("tags/rematch") rematch(@Req() req: AuthRequest) {
    permission(req, "analytics");
    permission(req, "templates:write");
    return this.service.rematch(req.user.organizationId);
  }
}
