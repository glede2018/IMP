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
import { accountWindowMetrics, videoWindowMetrics } from "./douyin-metrics.js";
import { SessionGuard, type AuthRequest } from "./auth.js";
import { hasPermission, permissionsFor } from "./permissions.js";
import { DouyinService } from "./douyin.js";
import { douyinConfig } from "./douyin-provider.js";
import { decryptToken } from "./oauth-crypto.js";
import {
  bucketFor,
  DataProviderError,
  DouyinDataProvider,
  matchTrackingTags,
  normalizeTrackingTag,
  shanghaiDate,
} from "./douyin-data-provider.js";
class DateQuery {
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
      where: { organizationId: org, platform: "douyin" },
      include: { authorization: true, syncStates: true },
      orderBy: { bindTime: "desc" },
    });
    return accounts.map((a) => ({
      id: a.id,
      name: a.nickname,
      type: a.tier,
      mode: a.authorization?.mode || "none",
      scopes: a.authorization?.scopes || [],
      states: ["videos", "fans"].map((kind) => {
        const saved = a.syncStates.find((s) => s.kind === kind);
        const reason = this.blocked(a.authorization, kind);
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
      where: { id: accountId, organizationId: org, platform: "douyin" },
      include: { authorization: true },
    });
    if (!account) throw new NotFoundException("抖音账号不存在");
    for (const kind of ["videos", "fans"]) {
      const reason = this.blocked(account.authorization, kind);
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
      if (!reason && state.nextAttemptAt && state.nextAttemptAt > new Date())
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
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      // 显式启用能力后分页发现账号，每轮推进游标，避免只处理前一百个账号。
      if (
        process.env.DOUYIN_FANS_SYNC_ENABLED === "true" ||
        process.env.DOUYIN_VIDEO_API_PROFILE === "website_v1"
      ) {
        const accounts = await this.db.account.findMany({
          where: {
            platform: "douyin",
            authorization: { is: { mode: "live" } },
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
            if (!this.blocked(a.authorization, kind))
              await this.db.douyinSyncState.upsert({
                where: { accountId_kind: { accountId: a.id, kind } },
                create: { accountId: a.id, kind, status: "queued" },
                update: {},
              });
        this.discoveryCursor =
          accounts.length === 100 ? accounts.at(-1)!.id : undefined;
      }
      const states = await this.db.douyinSyncState.findMany({
        where: {
          status: { notIn: terminalStates },
          AND: [
            { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
            { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          ],
        },
        orderBy: { updatedAt: "asc" },
        take: 10,
      });
      for (const state of states) await this.run(state.id);
    } catch {
      /* 不记录凭据或上游响应，下一个定时任务继续处理持久化作业。 */
    } finally {
      this.busy = false;
    }
  }
  async run(id: string) {
    const runId = randomUUID(),
      now = new Date();
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
        leaseUntil: new Date(Date.now() + 120000),
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
    let processed = 0;
    const settle = async (
      data: Prisma.DouyinSyncStateUpdateManyMutationInput,
    ) =>
      this.db.douyinSyncState.updateMany({
        where: { id, runId },
        data: { ...data, runId: null, leaseUntil: null },
      });
    try {
      let auth = state.account.authorization;
      const reason = this.blocked(auth, state.kind);
      if (reason) throw new DataProviderError("blocked", reason);
      await this.oauth.refreshAccount(state.accountId);
      auth = await this.db.accountAuthorization.findUnique({
        where: { accountId: state.accountId },
      });
      const refreshedReason = this.blocked(auth, state.kind);
      if (refreshedReason || !auth?.accessTokenCiphertext)
        throw new DataProviderError(
          "authorization_required",
          refreshedReason || "请重新授权",
        );
      const credential = auth;
      const token = decryptToken(
        credential.accessTokenCiphertext!,
        `douyin:${credential.clientKey}:${credential.openId}:access`,
      );
      let capturedAt = new Date();
      const transaction = async (
        write: (tx: Prisma.TransactionClient) => Promise<void>,
      ) =>
        this.db.$transaction(
          async (tx) => {
            const lease = await tx.douyinSyncState.updateMany({
              where: { id, runId, leaseUntil: { gt: new Date() } },
              data: { leaseUntil: new Date(Date.now() + 120000) },
            });
            if (!lease.count)
              throw new DataProviderError(
                "superseded",
                "同步租约已失效。",
                true,
              );
            const valid = await tx.accountAuthorization.updateMany({
              where: {
                accountId: state.accountId,
                revision: credential.revision,
                mode: "live",
              },
              data: { lastVerifiedAt: credential.lastVerifiedAt },
            });
            if (!valid.count)
              throw new DataProviderError(
                "authorization_required",
                "授权在同步期间发生变化，请重新同步。",
              );
            await write(tx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      if (state.kind === "fans") {
        const fans = await this.source.fans(token, credential.openId);
        capturedAt = new Date();
        const bucket = bucketFor(capturedAt);
        await transaction(async (tx) => {
          await tx.accountMetricSample.upsert({
            where: { accountId_bucket: { accountId: state.accountId, bucket } },
            create: { accountId: state.accountId, bucket, capturedAt, fans },
            update: { capturedAt, fans },
          });
        });
        processed = 1;
        await settle({
          status: "success",
          message: "已采集粉丝总量快照；历史净增需等待连续采集。",
          processed,
          failures: 0,
          lastSuccessAt: capturedAt,
          nextAttemptAt: new Date(Date.now() + 3600000),
        });
      } else {
        if (state.cursor === "0")
          await this.db.douyinSyncState.updateMany({
            where: { id, runId },
            data: { processed: 0 },
          });
        let cursor = state.cursor,
          hasMore = true,
          missing = false;
        for (let page = 0; page < 3 && hasMore; page++) {
          const result = await this.source.videos(
            token,
            credential.openId,
            cursor,
          );
          capturedAt = new Date();
          const bucket = bucketFor(capturedAt);
          await transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.account.organizationId + ":tags"}))`;
            const bindings = await tx.templateTrackingTag.findMany({
              where: {
                organizationId: state.account.organizationId,
                templateId: { not: null },
                active: true,
                deletedAt: null,
              },
            });
            for (const v of result.videos) {
              const prior = await tx.platformVideo.findUnique({
                where: {
                  accountId_remoteId: {
                    accountId: state.accountId,
                    remoteId: v.remoteId,
                  },
                },
                include: { binding: true },
              });
              const match =
                prior?.binding &&
                (!prior.binding.active || prior.binding.deletedAt)
                  ? {}
                  : matchTrackingTags(v.tags, bindings);
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
                  title: v.title,
                  tags: v.tags,
                  publishedAt: v.publishedAt,
                  lastSeenAt: capturedAt,
                  ...match,
                },
                update: {
                  title: v.title,
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
                  },
                  update: { capturedAt, ...v.metrics },
                });
              else missing = true;
            }
            await tx.douyinSyncState.updateMany({
              where: { id, runId },
              data: {
                cursor: result.hasMore ? result.cursor : "0",
                processed: { increment: result.videos.length },
              },
            });
          });
          cursor = result.cursor;
          hasMore = result.hasMore;
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
          failures: 0,
          nextAttemptAt: new Date(Date.now() + (hasMore ? 60000 : 3600000)),
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
      await settle({
        status: e.state,
        message: e.message,
        failures: { increment: 1 },
        nextAttemptAt: new Date(
          Date.now() +
            (e.retryable
              ? Math.min(3600000, 60000 * 2 ** Math.min(state.failures, 6))
              : 3600000),
        ),
      });
    }
  }
  async bindings(org: string) {
    return this.db.templateTrackingTag.findMany({
      where: { organizationId: org, templateId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
  }
  async availableTags(org: string) {
    return this.db.templateTrackingTag.findMany({
      where: { organizationId: org, active: true, deletedAt: null },
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
        const bindings = await tx.templateTrackingTag.findMany({
          where: {
            organizationId: org,
            templateId: { not: null },
            active: true,
            deletedAt: null,
          },
        });
        const videos = await tx.platformVideo.findMany({
          where: { organizationId: org },
          include: { binding: true },
        });
        let processed = 0;
        for (const v of videos) {
          if (v.binding && (!v.binding.active || v.binding.deletedAt)) continue;
          await tx.platformVideo.update({
            where: { id: v.id },
            data: matchTrackingTags(v.tags, bindings),
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
      platform: "douyin",
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
        accountId: { in: accounts.map((a) => a.id) },
        publishedAt: { lt: range.last },
      },
      include: { binding: true },
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
        const window = videoStats.get(v.id);
        const fields = ["views", "likes", "comments", "shares"] as const;
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
          accountId: v.accountId,
          publishedAt: v.publishedAt,
          tags: v.tags,
          matchStatus: v.matchStatus,
          template: v.binding
            ? {
                id:
                  canonical.get(
                    JSON.stringify([v.binding.templateId, v.binding.version]),
                  )?.id || v.binding.id,
                templateId: v.binding.templateId,
                title: v.binding.titleSnapshot,
                version: v.binding.version,
                tag: v.binding.tag,
              }
            : null,
          metrics,
          capturedAt: window?.capturedAt || null,
          latest: window?.capturedAt
            ? Object.fromEntries(
                fields.map((key) => [key, Number(window[`latest_${key}`])]),
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
    const sum = (values: (number | null)[]) =>
      !values.length || values.some((v) => v === null)
        ? null
        : values.reduce<number>((a, v) => a + v!, 0);
    const metrics = (rows: typeof videos) => ({
      views: sum(rows.map((v) => v.metrics.views)),
      likes: sum(rows.map((v) => v.metrics.likes)),
      comments: sum(rows.map((v) => v.metrics.comments)),
      shares: sum(rows.map((v) => v.metrics.shares)),
    });
    const accountRows = accounts.map((a) => {
      const window = fanStats.get(a.id);
      const own = byAccount.get(a.id) || [];
      return {
        id: a.id,
        name: a.nickname,
        type: a.tier,
        store: a.store?.name || null,
        published: own.filter((v) => v.publishedAt >= range.first).length,
        metrics: metrics(own),
        fans: window?.fans == null ? null : Number(window.fans),
        fansCapturedAt: window?.capturedAt || null,
        netFans: window?.netFans == null ? null : Number(window.netFans),
      };
    });
    const bindings = [...canonical.values()];
    return {
      source: "live",
      ...{ start: range.start, end: range.end },
      basis:
        "采集快照观察增量；不等同于平台按自然日统计。首次采集缺少期初基线时显示—。粉丝来源可能含抖音极速版及火山。",
      accounts: accountRows,
      videos,
      summary: {
        ...metrics(videos),
        published: videos.filter((v) => v.publishedAt >= range.first).length,
        participating: accountRows.filter((a) => a.published > 0).length,
        fans: sum(accountRows.map((a) => a.fans)),
        netFans: sum(accountRows.map((a) => a.netFans)),
        videoCount: videos.length,
        measuredVideos: videos.filter((v) => v.metrics.views !== null).length,
        unmatched: videos.filter((v) => v.matchStatus === "unmatched").length,
        conflicts: videos.filter((v) => v.matchStatus === "conflict").length,
      },
      templates: bindings.map((b) => {
        const own = byTemplate.get(b.id) || [];
        const m = metrics(own);
        return {
          id: b.id,
          templateId: b.templateId,
          title: b.titleSnapshot,
          version: b.version,
          tag: b.tag,
          published: own.filter((v) => v.publishedAt >= range.first).length,
          videoCount: own.length,
          accounts: new Set(own.map((v) => v.accountId)).size,
          metrics: m,
          average:
            own.length && m.views !== null
              ? Math.round(m.views / own.length)
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
@Controller("analytics/douyin")
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
