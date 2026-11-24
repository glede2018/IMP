import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, Length } from "class-validator";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Database } from "./database.js";
import { AuthRequest, requireRole, SessionGuard } from "./auth.js";
import { DataProviderError } from "./douyin-data-provider.js";
import { OneApiDataProvider, oneapiEnabled, profileInput } from "./oneapi.js";
import { tokenKey } from "./oauth-crypto.js";
import { DouyinAnalyticsService } from "./douyin-analytics.js";

class ProfileQueryDto {
  @IsOptional() @IsString() @Length(0, 300) sec_uid?: string;
  @IsOptional() @IsString() @Length(0, 2048) share_text?: string;
}
class ConfirmProfileDto {
  @IsString() @Length(1, 8192) confirmationToken!: string;
}
interface Confirmation {
  accountId: string;
  organizationId: string;
  actorId: string;
  revision: number;
  expires: number;
  profile: {
    uid: string;
    secUid: string;
    nickname: string;
    avatar: string | null;
  };
}
// 查询与确认分开，签名绑定账号、操作者和授权版本，确认时不再次付费查询。
function sign(value: string) {
  return createHmac("sha256", tokenKey())
    .update("oneapi-profile:" + value)
    .digest();
}
function seal(value: Confirmation) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return encoded + "." + sign(encoded).toString("base64url");
}
function open(value: string): Confirmation {
  try {
    const [encoded, signature, extra] = value.split(".");
    const actual = Buffer.from(signature || "", "base64url");
    const expected = sign(encoded);
    if (
      extra ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw Error();
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as Confirmation;
    if (!Number.isFinite(payload.expires) || payload.expires <= Date.now())
      throw Error();
    return payload;
  } catch {
    throw new BadRequestException("查询结果已过期或无效，请重新查询用户信息");
  }
}
@Controller("accounts")
@UseGuards(SessionGuard)
export class AccountDataController {
  constructor(
    private db: Database,
    private analytics: DouyinAnalyticsService,
  ) {}
  @Get("data-config") config() {
    return { provider: oneapiEnabled() ? "oneapi" : "official" };
  }
  private async account(
    db: Pick<Database, "account">,
    id: string,
    req: AuthRequest,
  ) {
    const account = await db.account.findFirst({
      where: {
        id,
        organizationId: req.user.organizationId,
        platform: "douyin",
      },
      include: { authorization: true },
    });
    if (!account) throw new NotFoundException("抖音账号不存在");
    if (
      account.authorization?.mode !== "live" ||
      account.authorization.refreshExpiresAt <= new Date()
    )
      throw new BadRequestException("请先完成本账号的正式抖音扫码授权");
    return account;
  }
  @Post(":id/data-profile/preview") async preview(
    @Param("id") id: string,
    @Body() dto: ProfileQueryDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    const account = await this.account(this.db, id, req);
    if (!oneapiEnabled())
      throw new BadRequestException("尚未启用 OneAPI 数据采集");
    const input = profileInput(dto);
    if (!input)
      throw new BadRequestException(
        "请填写有效的 sec_uid 或抖音主页分享链接，两项至少填写一项",
      );
    const fetched = await new OneApiDataProvider()
      .profile(input)
      .catch((error) => {
        if (error instanceof DataProviderError)
          throw new ServiceUnavailableException(error.message);
        throw error;
      });
    const { fans: _fans, ...profile } = fetched;
    if (account.dataSecUid && account.dataSecUid !== profile.secUid)
      throw new ConflictException(
        "查询用户与该账号已绑定的 ID 不一致，请核对当前扫码授权账号",
      );
    return {
      ...profile,
      confirmationToken: seal({
        accountId: id,
        organizationId: req.user.organizationId,
        actorId: req.user.id,
        revision: account.authorization!.revision,
        expires: Date.now() + 10 * 60000,
        profile,
      }),
    };
  }
  @Put(":id/data-profile") async configure(
    @Param("id") id: string,
    @Body() dto: ConfirmProfileDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    // 在返回任何查询结果前验证当前账号范围。
    await this.account(this.db, id, req);
    const confirmation = open(dto.confirmationToken);
    if (
      confirmation.accountId !== id ||
      confirmation.organizationId !== req.user.organizationId ||
      confirmation.actorId !== req.user.id
    )
      throw new BadRequestException("查询结果与当前账号不匹配，请重新查询");
    const { result, initialize } = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id=${id} AND "organizationId"=${req.user.organizationId} FOR UPDATE`;
      const account = await this.account(
        tx as Pick<Database, "account">,
        id,
        req,
      );
      if (account.authorization!.revision !== confirmation.revision)
        throw new ConflictException("授权已发生变化，请重新查询用户信息");
      const profile = confirmation.profile;
      const alreadyBound = account.dataSecUid === profile.secUid;
      if (
        !alreadyBound &&
        (account.dataSecUid ||
          (await tx.platformVideo.count({
            where: { accountId: id, source: "oneapi_v2" },
          })) ||
          (await tx.accountMetricSample.count({
            where: { accountId: id, source: "oneapi_v2" },
          })))
      )
        throw new ConflictException(
          "该账号已有其他采集身份或历史数据，请核对当前扫码授权账号",
        );
      if (
        await tx.account.findFirst({
          where: {
            organizationId: req.user.organizationId,
            platform: "douyin",
            dataUid: profile.uid,
            id: { not: id },
          },
          select: { id: true },
        })
      )
        throw new ConflictException("该 ID 已关联本组织的其他账号");
      const result = await tx.account.update({
        where: { id },
        data: {
          dataProfile: profile.secUid,
          dataSecUid: profile.secUid,
          dataUid: profile.uid,
          nickname: profile.nickname,
          avatar: profile.avatar,
        },
      });
      // 首次绑定时持久化两类初始化任务，进程重启后仍可由定时扫描接续。
      if (!alreadyBound)
        for (const kind of ["fans", "videos"]) {
          const data = {
            status: "queued",
            message: "等待账号初始化",
            cursor: "0",
            nextAttemptAt: null,
            runId: null,
            leaseUntil: null,
            failures: 0,
            processed: 0,
          };
          await tx.douyinSyncState.upsert({
            where: { accountId_kind: { accountId: id, kind } },
            create: { accountId: id, kind, ...data },
            update: data,
          });
        }
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: "account.dataProfile.confirm",
          entityId: id,
        },
      });
      return { result, initialize: !alreadyBound };
    });
    if (initialize)
      // 提交事务后异步执行，不阻塞确认请求；异常时由持久化队列继续处理。
      void this.analytics.initializeAccount(id).catch(() => {});
    return result;
  }
}
