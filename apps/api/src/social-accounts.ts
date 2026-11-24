import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Database } from "./database.js";
import { type AuthRequest, requireRole, SessionGuard } from "./auth.js";
import { tokenKey } from "./oauth-crypto.js";
import { DataProviderError } from "./douyin-data-provider.js";
import { DouyinAnalyticsService } from "./douyin-analytics.js";
import {
  socialPlatforms,
  socialProfileInput,
  SocialOneApiProvider,
  type SocialPlatform,
} from "./social-oneapi.js";
import { oneapiEnabled } from "./oneapi.js";
class PreviewDto {
  @IsIn(socialPlatforms) platform!: SocialPlatform;
  @IsOptional() @IsString() @Length(0, 512) user_id?: string;
  @IsOptional() @IsString() @Length(0, 2048) share_text?: string;
  @IsOptional() @IsString() @Length(1, 100) accountId?: string;
}
class BindDto {
  @IsString() @Length(1, 12000) confirmationToken!: string;
  @IsIn(["brand", "personal_ip", "store_ip"]) tier!: string;
  @IsOptional() @IsString() @Length(1, 100) storeId?: string;
}
type Confirm = {
  org: string;
  actor: string;
  platform: SocialPlatform;
  target: string | null;
  revision: number;
  expires: number;
  profile: {
    uid: string;
    secUid: string;
    nickname: string;
    avatar: string | null;
    fans: string | null;
  };
};
const sign = (value: string) =>
  createHmac("sha256", tokenKey())
    .update("social-profile:" + value)
    .digest();
function seal(value: Confirm) {
  const raw = Buffer.from(JSON.stringify(value)).toString("base64url");
  return raw + "." + sign(raw).toString("base64url");
}
function open(value: string): Confirm {
  try {
    const [raw, sig, extra] = value.split(".");
    const actual = Buffer.from(sig || "", "base64url");
    const expected = sign(raw);
    if (
      extra ||
      expected.length !== actual.length ||
      !timingSafeEqual(actual, expected)
    )
      throw Error();
    const result = JSON.parse(
      Buffer.from(raw, "base64url").toString(),
    ) as Confirm;
    if (!Number.isFinite(result.expires) || result.expires <= Date.now())
      throw Error();
    return result;
  } catch {
    throw new BadRequestException("查询结果已过期，请重新查询账号信息");
  }
}
@Controller("accounts")
@UseGuards(SessionGuard)
export class SocialAccountsController {
  private provider = new SocialOneApiProvider();
  constructor(
    private db: Database,
    private analytics: DouyinAnalyticsService,
  ) {}
  private ready() {
    if (!oneapiEnabled())
      throw new BadRequestException("尚未启用 OneAPI 数据采集");
  }
  @Post("profile/preview") async preview(
    @Body() dto: PreviewDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    this.ready();
    const target = dto.accountId
      ? await this.db.account.findFirst({
          where: {
            id: dto.accountId,
            organizationId: req.user.organizationId,
            platform: dto.platform,
          },
        })
      : null;
    if (dto.accountId && !target) throw new NotFoundException("账号不存在");
    const input = socialProfileInput(dto.platform, dto);
    if (!input)
      throw new BadRequestException(
        dto.platform === "shipinhao"
          ? "请填写视频号 sph ID、v2_…@finder 或有效的视频号分享链接"
          : "请填写该平台有效的用户 ID 或主页分享链接，两项至少填写一项",
      );
    const profile = await this.provider
      .profile(dto.platform, input)
      .catch((e) => {
        if (e instanceof DataProviderError)
          throw new ServiceUnavailableException(e.message);
        throw e;
      });
    if (target?.dataUid && target.dataUid !== profile.uid)
      throw new ConflictException("该账号已绑定其他采集身份，请重新添加账号");
    const safe = { ...profile, fans: profile.fans?.toString() ?? null };
    return {
      ...safe,
      confirmationToken: seal({
        org: req.user.organizationId,
        actor: req.user.id,
        platform: dto.platform,
        target: target?.id || null,
        revision: target?.dataRevision || 0,
        expires: Date.now() + 10 * 60000,
        profile: safe,
      }),
    };
  }
  @Post("profile/bind") async bind(
    @Body() dto: BindDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    this.ready();
    const payload = open(dto.confirmationToken);
    if (
      payload.org !== req.user.organizationId ||
      payload.actor !== req.user.id
    )
      throw new BadRequestException("查询结果与当前登录用户不匹配");
    const { account, initialize } = await this.db.$transaction(async (tx) => {
      // 同平台同身份串行绑定，重放确认不会重复创建或重复触发初始化。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.org + ":" + payload.platform + ":" + payload.profile.uid}))`;
      if (
        dto.storeId &&
        !(await tx.store.findFirst({
          where: { id: dto.storeId, organizationId: payload.org },
        }))
      )
        throw new BadRequestException("门店不存在");
      const existing = payload.target
        ? await tx.account.findFirst({
            where: {
              id: payload.target,
              organizationId: payload.org,
              platform: payload.platform,
            },
          })
        : await tx.account.findUnique({
            where: {
              organizationId_platform_dataUid: {
                organizationId: payload.org,
                platform: payload.platform,
                dataUid: payload.profile.uid,
              },
            },
          });
      if (payload.target && !existing)
        throw new NotFoundException("账号不存在");
      if (
        existing?.dataProvider === "oneapi" &&
        existing.dataUid === payload.profile.uid &&
        !payload.target
      )
        return { account: existing, initialize: false };
      if (
        existing &&
        payload.target &&
        (existing.dataRevision !== payload.revision ||
          (existing.dataUid && existing.dataUid !== payload.profile.uid))
      )
        throw new ConflictException("账号身份已变更，请重新查询");
      const duplicate = await tx.account.findFirst({
        where: {
          organizationId: payload.org,
          platform: payload.platform,
          dataUid: payload.profile.uid,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
      });
      if (duplicate)
        throw new ConflictException("该平台用户已绑定本组织的其他账号");
      const data = {
        dataProvider: "oneapi",
        dataProfile: payload.profile.secUid,
        dataSecUid: payload.profile.secUid,
        dataUid: payload.profile.uid,
        nickname: payload.profile.nickname,
        avatar: payload.profile.avatar,
        status: "active",
        tier: dto.tier,
        storeId: dto.storeId || null,
      };
      const initialize =
        existing?.dataProvider !== "oneapi" || !existing.dataUid;
      const account = existing
        ? await tx.account.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(initialize ? { dataRevision: { increment: 1 } } : {}),
            },
          })
        : await tx.account.create({
            data: {
              ...data,
              organizationId: payload.org,
              platform: payload.platform,
              accountId: payload.profile.uid,
            },
          });
      if (initialize)
        for (const kind of ["fans", "videos"])
          await tx.douyinSyncState.upsert({
            where: { accountId_kind: { accountId: account.id, kind } },
            create: {
              accountId: account.id,
              kind,
              status: "queued",
              message: "等待账号初始化",
            },
            update: {
              status: "queued",
              message: "等待账号初始化",
              cursor: "0",
              nextAttemptAt: null,
              runId: null,
              leaseUntil: null,
              processed: 0,
              failures: 0,
            },
          });
      await tx.auditLog.create({
        data: {
          organizationId: payload.org,
          actorId: payload.actor,
          action: "account.oneapi.bind",
          entityId: account.id,
        },
      });
      return { account, initialize };
    });
    if (initialize)
      void this.analytics.initializeAccount(account.id).catch(() => {});
    return account;
  }
}
