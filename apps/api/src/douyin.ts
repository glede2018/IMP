import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type { OAuthState } from "@prisma/client";
import { Database } from "./database.js";
import { SessionGuard, requireRole, type AuthRequest } from "./auth.js";
import { cookieName, tokenHash } from "./security.js";
import { encryptToken, decryptToken } from "./oauth-crypto.js";
import {
  DouyinProvider,
  DouyinApiError,
  douyinConfig,
  type DouyinToken,
  type DouyinProfile,
} from "./douyin-provider.js";

export class DouyinStartDto {
  @IsIn(["brand", "personal_ip", "store_ip"]) @ApiProperty() tier!: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @ApiPropertyOptional()
  storeId?: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @ApiPropertyOptional()
  targetAccountId?: string;
  @IsOptional() @IsIn(["live", "demo", "trial"]) @ApiPropertyOptional() mode:
    "live" | "demo" | "trial" = "live";
}
class DemoConfirmDto {
  @Matches(/^[a-f0-9]{64}$/) @ApiProperty() state!: string;
  @IsIn(["approve", "cancel"]) @ApiProperty() decision!: string;
}
export const authorizationSelect = {
  mode: true,
  scopes: true,
  accessExpiresAt: true,
  refreshExpiresAt: true,
  lastVerifiedAt: true,
  accessTokenCiphertext: false,
  refreshTokenCiphertext: false,
} as const;
export function accountView<
  T extends {
    status: string;
    authorization?: {
      mode: string;
      scopes: string[];
      accessExpiresAt: Date;
      refreshExpiresAt: Date;
      lastVerifiedAt: Date;
    } | null;
  },
>(account: T) {
  const { authorization, ...rest } = account;
  const expired = authorization && authorization.accessExpiresAt <= new Date();
  return {
    ...rest,
    status:
      authorization?.mode === "demo"
        ? "warning"
        : account.status === "active" && expired
          ? "inactive"
          : account.status,
    authorization: authorization
      ? {
          mode: authorization.mode,
          scopes: authorization.scopes,
          expiresAt: authorization.accessExpiresAt,
          refreshExpiresAt: authorization.refreshExpiresAt,
          lastVerifiedAt: authorization.lastVerifiedAt,
        }
      : null,
  };
}
const context = (clientKey: string, openId: string, kind: string) =>
  `douyin:${clientKey}:${openId}:${kind}`;
@Injectable()
export class DouyinService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private workerBusy = false;
  private logger = new Logger("Douyin");
  constructor(
    private db: Database,
    private provider: DouyinProvider,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.refreshDue(), 15 * 60 * 1000);
    this.timer.unref();
    // No outbound work is attempted for demo accounts or when the application is unconfigured.
    void this.refreshDue();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private sessionId(req: AuthRequest) {
    return tokenHash(req.cookies[cookieName]);
  }
  result(result: string) {
    return `${process.env.APP_ORIGIN}/accounts?douyin=${result}`;
  }
  private async validateTarget(req: AuthRequest, dto: DouyinStartDto) {
    if (
      dto.storeId &&
      !(await this.db.store.findFirst({
        where: { id: dto.storeId, organizationId: req.user.organizationId },
      }))
    )
      throw new BadRequestException("门店不存在");
    if (
      dto.targetAccountId &&
      !(await this.db.account.findFirst({
        where: {
          id: dto.targetAccountId,
          organizationId: req.user.organizationId,
          platform: "douyin",
        },
      }))
    )
      throw new NotFoundException("抖音账号不存在");
  }
  async start(req: AuthRequest, dto: DouyinStartDto) {
    requireRole(req);
    await this.validateTarget(req, dto);
    const config = douyinConfig();
    if (dto.mode === "demo" && !config.demoAvailable)
      throw new ForbiddenException("本地授权演示未启用");
    if (dto.mode !== "demo") this.provider.ensureConfigured();
    const raw = randomBytes(32).toString("hex");
    await this.db.$transaction([
      this.db.oAuthState.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }),
      this.db.oAuthState.create({
        data: {
          id: tokenHash(raw),
          sessionId: this.sessionId(req),
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          tier: dto.tier,
          storeId: dto.storeId,
          targetAccountId: dto.targetAccountId,
          mode: dto.mode,
          clientKey:
            dto.mode === "demo" ? "__imp_local_demo__" : config.clientKey,
          redirectUri:
            dto.mode === "demo"
              ? `${process.env.APP_ORIGIN}/api/v1/oauth/douyin/demo`
              : config.redirectUri,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      }),
    ]);
    return {
      authorizationUrl:
        dto.mode === "demo"
          ? `/api/v1/oauth/douyin/demo?state=${raw}`
          : this.provider.authorizationUrl(
              raw,
              dto.mode === "trial" ? "trial" : "live",
            ),
      mode: dto.mode,
    };
  }
  async state(
    req: AuthRequest,
    raw: string,
    mode: string | string[],
    consume = false,
  ): Promise<OAuthState> {
    requireRole(req);
    if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw))
      throw new BadRequestException("授权请求已失效，请重新发起");
    const where = {
      id: tokenHash(raw),
      sessionId: this.sessionId(req),
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      mode: Array.isArray(mode) ? { in: mode } : mode,
      expiresAt: { gt: new Date() },
    };
    return this.db.$transaction(async (tx) => {
      const state = await tx.oAuthState.findFirst({ where });
      if (!state) throw new BadRequestException("授权请求已失效，请重新发起");
      if (consume && (await tx.oAuthState.deleteMany({ where })).count !== 1)
        throw new BadRequestException("授权请求已使用，请重新发起");
      return state;
    });
  }
  async callback(req: AuthRequest, raw: string, code?: string, error?: string) {
    const state = await this.state(req, raw, ["live", "trial"], true);
    if (error) return this.result("cancelled");
    if (!code || typeof code !== "string" || code.length > 2048)
      throw new BadRequestException("未收到有效的抖音授权码");
    const config = this.provider.ensureConfigured();
    if (
      state.clientKey !== config.clientKey ||
      state.redirectUri !== config.redirectUri
    )
      throw new BadRequestException("应用配置已变更，请重新授权");
    if (state.mode === "trial") {
      // 入白授权与账号绑定独立，不获取用户资料或保存账号凭证。
      await this.db.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: "account.douyin.trial_authorized",
          entityId: config.clientKey,
        },
      });
      return this.result("trial_authorized");
    }
    const token = await this.provider.exchange(code);
    const profile = await this.provider.profile(
      token.accessToken,
      token.openId,
    );
    await this.bind(req, state, profile, token);
    return this.result("connected");
  }
  async demo(req: AuthRequest, dto: DemoConfirmDto) {
    if (!douyinConfig().demoAvailable)
      throw new ForbiddenException("本地演示未启用");
    const state = await this.state(req, dto.state, "demo", true);
    if (dto.decision === "cancel")
      return { redirectUrl: this.result("cancelled") };
    await this.bind(req, state, {
      openId: `demo:${req.user.id}`,
      nickname: "抖音本地演示账号（非真实账号）",
    });
    return { redirectUrl: this.result("demo") };
  }
  private async bind(
    req: AuthRequest,
    state: OAuthState,
    profile: DouyinProfile,
    token?: DouyinToken,
  ) {
    const orgId = req.user.organizationId;
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      // Serialize duplicate grants across API instances without holding a connection during HTTP requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`douyin:${state.clientKey}:${profile.openId}`}))`;
      if (
        state.storeId &&
        !(await tx.store.findFirst({
          where: { id: state.storeId, organizationId: orgId },
        }))
      )
        throw new BadRequestException("门店已删除，请重新授权");
      const owner = await tx.accountAuthorization.findUnique({
        where: {
          clientKey_openId: {
            clientKey: state.clientKey,
            openId: profile.openId,
          },
        },
        include: { account: true },
      });
      if (owner && owner.account.organizationId !== orgId)
        throw new ConflictException("该抖音账号已绑定其他组织");
      let target = state.targetAccountId
        ? await tx.account.findFirst({
            where: {
              id: state.targetAccountId,
              organizationId: orgId,
              platform: "douyin",
            },
            include: { authorization: true },
          })
        : null;
      if (state.targetAccountId && !target)
        throw new NotFoundException("账号已删除，请重新发起绑定");
      if (
        target?.authorization &&
        (target.authorization.openId !== profile.openId ||
          target.authorization.clientKey !== state.clientKey ||
          target.authorization.mode !== state.mode)
      )
        throw new ConflictException(
          "授权账号与原绑定账号不同，请从绑定账号入口新增",
        );
      if (owner && target && owner.accountId !== target.id)
        throw new ConflictException("该抖音账号已在本组织绑定");
      const existing = await tx.account.findUnique({
        where: {
          organizationId_platform_accountId: {
            organizationId: orgId,
            platform: "douyin",
            accountId: profile.openId,
          },
        },
      });
      if (existing && target && existing.id !== target.id)
        throw new ConflictException("该抖音账号已登记，请在原记录中授权");
      const data = {
        nickname: profile.nickname,
        avatar: profile.avatar || null,
        accountId: profile.openId,
        tier: state.tier,
        storeId: state.storeId || null,
        status: token ? "active" : "warning",
        bindTime: now,
      };
      const account =
        target || owner || existing
          ? await tx.account.update({
              where: { id: target?.id || owner?.accountId || existing!.id },
              data,
            })
          : await tx.account.create({
              data: { ...data, organizationId: orgId, platform: "douyin" },
            });
      const credential = {
        mode: state.mode,
        clientKey: state.clientKey,
        openId: profile.openId,
        scopes: token?.scopes || ["user_info"],
        accessTokenCiphertext: token
          ? encryptToken(
              token.accessToken,
              context(state.clientKey, profile.openId, "access"),
            )
          : null,
        refreshTokenCiphertext: token
          ? encryptToken(
              token.refreshToken,
              context(state.clientKey, profile.openId, "refresh"),
            )
          : null,
        accessExpiresAt: new Date(
          now.getTime() + (token?.expiresIn || 15 * 86400) * 1000,
        ),
        refreshExpiresAt: new Date(
          now.getTime() + (token?.refreshExpiresIn || 30 * 86400) * 1000,
        ),
        lastVerifiedAt: now,
        refreshLockUntil: null,
      };
      await tx.accountAuthorization.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, ...credential },
        update: { ...credential, revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: req.user.id,
          action: token ? "account.douyin.authorized" : "account.douyin.demo",
          entityId: account.id,
        },
      });
    });
  }
  private async invalid(accountId: string, revision: number) {
    await this.db.$transaction(async (tx) => {
      const changed = await tx.accountAuthorization.updateMany({
        where: { accountId, revision },
        data: {
          accessTokenCiphertext: null,
          refreshTokenCiphertext: null,
          refreshLockUntil: null,
          revision: { increment: 1 },
        },
      });
      if (changed.count)
        await tx.account.update({
          where: { id: accountId },
          data: { status: "inactive" },
        });
    });
  }
  async refreshAccount(accountId: string, force = false) {
    const config = this.provider.ensureConfigured();
    const credential = await this.db.accountAuthorization.findUnique({
      where: { accountId },
    });
    if (
      !credential ||
      credential.mode !== "live" ||
      !credential.refreshTokenCiphertext ||
      !credential.accessTokenCiphertext
    )
      throw new BadRequestException("请重新进行抖音授权");
    if (credential.clientKey !== config.clientKey)
      throw new BadRequestException("应用已变更，请重新授权");
    if (credential.refreshExpiresAt <= new Date()) {
      await this.invalid(accountId, credential.revision);
      throw new BadRequestException("授权已过期，请重新授权");
    }
    if (!force && credential.accessExpiresAt.getTime() > Date.now() + 86400000)
      return;
    const locked = await this.db.accountAuthorization.updateMany({
      where: {
        accountId,
        revision: credential.revision,
        OR: [
          { refreshLockUntil: null },
          { refreshLockUntil: { lt: new Date() } },
        ],
      },
      data: {
        refreshLockUntil: new Date(Date.now() + 120000),
        revision: { increment: 1 },
      },
    });
    if (!locked.count)
      throw new ConflictException("正在更新授权状态，请稍后重试");
    const leaseRevision = credential.revision + 1;
    try {
      const refresh = decryptToken(
        credential.refreshTokenCiphertext,
        context(credential.clientKey, credential.openId, "refresh"),
      );
      const token = await this.provider.refresh(
        refresh,
        credential.openId,
        credential.scopes,
      );
      const profile = await this.provider.profile(
        token.accessToken,
        credential.openId,
      );
      await this.db.$transaction(async (tx) => {
        const changed = await tx.accountAuthorization.updateMany({
          where: { accountId, revision: leaseRevision },
          data: {
            accessTokenCiphertext: encryptToken(
              token.accessToken,
              context(credential.clientKey, credential.openId, "access"),
            ),
            refreshTokenCiphertext: encryptToken(
              token.refreshToken,
              context(credential.clientKey, credential.openId, "refresh"),
            ),
            accessExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
            scopes: token.scopes,
            lastVerifiedAt: new Date(),
            refreshLockUntil: null,
            revision: { increment: 1 },
          },
        });
        // refresh_token has a fixed lifetime; refreshing access_token must never extend it.
        if (changed.count)
          await tx.account.update({
            where: { id: accountId },
            data: {
              nickname: profile.nickname,
              avatar: profile.avatar || null,
              status: "active",
            },
          });
      });
    } catch (e) {
      if (e instanceof DouyinApiError && e.invalidAuthorization) {
        await this.invalid(accountId, leaseRevision);
        throw new BadRequestException("抖音授权已失效，请重新授权");
      }
      throw new ServiceUnavailableException(
        "抖音授权状态暂时无法更新，请稍后重试",
      );
    } finally {
      await this.db.accountAuthorization.updateMany({
        where: { accountId, revision: leaseRevision },
        data: { refreshLockUntil: null },
      });
    }
  }
  async sync(req: AuthRequest, accountId: string) {
    requireRole(req);
    const account = await this.db.account.findFirst({
      where: {
        id: accountId,
        organizationId: req.user.organizationId,
        platform: "douyin",
      },
      include: { authorization: { select: authorizationSelect } },
    });
    if (!account) throw new NotFoundException("账号不存在");
    if (account.authorization?.mode === "demo") return accountView(account);
    await this.refreshAccount(accountId, true);
    await this.db.auditLog.create({
      data: {
        organizationId: req.user.organizationId,
        actorId: req.user.id,
        action: "account.douyin.refresh",
        entityId: accountId,
      },
    });
    return accountView(
      await this.db.account.findUniqueOrThrow({
        where: { id: accountId },
        include: { authorization: { select: authorizationSelect } },
      }),
    );
  }
  private async refreshDue() {
    if (this.workerBusy || !douyinConfig().ready) return;
    this.workerBusy = true;
    try {
      const due = await this.db.accountAuthorization.findMany({
        where: {
          mode: "live",
          clientKey: douyinConfig().clientKey,
          accessTokenCiphertext: { not: null },
          OR: [
            { accessExpiresAt: { lte: new Date(Date.now() + 86400000) } },
            { refreshExpiresAt: { lte: new Date() } },
          ],
        },
        select: { accountId: true },
        take: 25,
        orderBy: { accessExpiresAt: "asc" },
      });
      for (const { accountId } of due) {
        try {
          await this.refreshAccount(accountId);
        } catch {
          this.logger.warn(
            "One Douyin authorization needs retry or reauthorization.",
          );
        }
      }
      await this.db.oAuthState.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    } catch {
      this.logger.warn("Douyin authorization maintenance deferred.");
    } finally {
      this.workerBusy = false;
    }
  }
}
@Controller("oauth/douyin")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class DouyinController {
  constructor(private service: DouyinService) {}
  @Get("config") config(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    const c = douyinConfig();
    return {
      ready: c.ready,
      reason: c.reason,
      demoAvailable: c.demoAvailable,
      scopes: c.scopes,
    };
  }
  @Post("start") start(@Req() req: AuthRequest, @Body() dto: DouyinStartDto) {
    return this.service.start(req, dto);
  }
  @Get("callback") async callback(
    @Req() req: AuthRequest,
    @Query("state") state: string,
    @Query("code") code: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      res.redirect(303, await this.service.callback(req, state, code, error));
    } catch (e) {
      const result =
        e instanceof ConflictException
          ? "conflict"
          : e instanceof BadRequestException
            ? "invalid"
            : e instanceof ForbiddenException
              ? "forbidden"
              : "failed";
      res.redirect(303, this.service.result(result));
    }
  }
  @Post("accounts/:id/refresh") refresh(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.sync(req, id);
  }
  @Post("demo/confirm") confirm(
    @Req() req: AuthRequest,
    @Body() dto: DemoConfirmDto,
  ) {
    return this.service.demo(req, dto);
  }
  @Get("demo") async demo(
    @Req() req: AuthRequest,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    if (!douyinConfig().demoAvailable)
      throw new ForbiddenException("本地授权演示未启用");
    await this.service.state(req, state, "demo");
    const nonce = randomBytes(18).toString("base64");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    );
    res.type("html")
      .send(`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>抖音授权 · 本地演示</title>
<style nonce="${nonce}">body{margin:0;background:#fff7ed;color:#2c2924;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{background:white;border:1px solid #e9e5dd;border-radius:12px;padding:32px;max-width:440px;margin:20px}h1{font-size:23px}p{line-height:1.7;color:#766e60}.badge{display:inline-block;background:#ffedd5;color:#9a3412;border-radius:16px;padding:4px 12px;font-size:13px}button{padding:10px 20px;border-radius:8px;border:1px solid #e9e5dd;background:white;cursor:pointer;margin:8px 8px 0 0;font-size:15px}.primary{background:#ea580c;color:white;border-color:#ea580c}button:disabled{opacity:.5}</style>
<main><span class="badge">本地演示 · 非抖音官方授权</span><h1>确认绑定演示账号</h1><p>账号：抖音本地演示账号（非真实账号）</p><p>此流程用于体验授权确认、返回账号页和解绑。不会连接抖音、不会取得真实授权，也不具备发布或数据同步权限。</p><button class="primary" id="approve">确认演示授权</button><button id="cancel">取消</button><p id="error" role="alert"></p></main>
<script nonce="${nonce}">for(const decision of ['approve','cancel']){document.getElementById(decision).onclick=async()=>{for(const b of document.querySelectorAll('button'))b.disabled=true;try{const r=await fetch('/api/v1/oauth/douyin/demo/confirm',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-IMP-Request':'1'},body:JSON.stringify({state:'${state}',decision})});const d=await r.json();if(!r.ok)throw new Error(d.message||'演示请求已失效，请返回重新发起');location.replace(d.redirectUrl);}catch(e){document.getElementById('error').textContent=e.message;for(const b of document.querySelectorAll('button'))b.disabled=false;}}}</script></html>`);
  }
}
