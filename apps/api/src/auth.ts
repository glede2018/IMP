import { validRequestOrigin } from "./app-origins.js";
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import {
  accessInclude,
  permissionsFor,
  hasPermission,
  moduleFor,
  type AccessUser,
} from "./permissions.js";
import { Database } from "./database.js";
import { LoginDto, PasswordDto } from "./dto.js";
import {
  cookieName,
  hashPassword,
  verifyPassword,
  tokenHash,
  writeRoles,
} from "./security.js";
export type AuthRequest = Request & { user: AccessUser };
export function requireRole(req: AuthRequest, roles = writeRoles) {
  if (
    !hasPermission(permissionsFor(req.user), "*") &&
    !(
      roles.includes("reviewer") &&
      hasPermission(permissionsFor(req.user), "works:review")
    ) &&
    !(
      (roles.includes("operator") || moduleFor(req.path) === "help") &&
      hasPermission(permissionsFor(req.user), `${moduleFor(req.path)}:write`)
    )
  )
    throw new ForbiddenException("没有此操作权限");
}
export const userView = (
  u: AccessUser & { organization?: { name: string } },
) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  phone: u.phone,
  role: u.role,
  active: u.active,
  organizationId: u.organizationId,
  company: u.organization?.name,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
  roles: u.assignments.map((a) => ({
    id: a.role.id,
    name: a.role.name,
    active: a.role.active,
  })),
  permissions: permissionsFor(u),
});
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.[cookieName];
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("请先登录");
    const session = await this.db.session.findUnique({
      where: { id: tokenHash(token) },
      include: { user: { include: accessInclude } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new UnauthorizedException(
        "登录已失效，请重新登录；同一账号仅允许一处登录",
      );
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      // 自定义请求头与明确的来源白名单共同防止跨站提交。
      if (!validRequestOrigin(req))
        throw new ForbiddenException("请求来源无效");
    }
    const permissions = permissionsFor(session.user);
    const key = moduleFor(req.path);
    const workFile =
      key === "assets" &&
      ["GET", "HEAD"].includes(req.method) &&
      /^\/api\/v1\/assets\/[^/]+\/file$/.test(req.path) &&
      hasPermission(permissions, "works")
        ? await this.db.work.findFirst({
            where: {
              organizationId: session.user.organizationId,
              assetId: req.path.split("/")[4],
            },
            select: { id: true },
          })
        : null;
    if (
      key &&
      !["auth", "health"].includes(key) &&
      !req.path.endsWith("/organization/stores") &&
      !hasPermission(permissions, key) &&
      !workFile &&
      !(key === "analytics" && hasPermission(permissions, "home"))
    )
      throw new ForbiddenException("没有此菜单访问权限");
    req.user = session.user;
    return true;
  }
}
@Controller("auth")
export class AuthController {
  constructor(private db: Database) {}
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!validRequestOrigin(req)) throw new ForbiddenException("请求来源无效");
    if (!dto.phone && !dto.account)
      throw new UnauthorizedException("请输入账号或手机号");
    const user = await this.db.user.findUnique({
      where: dto.account ? { username: dto.account } : { phone: dto.phone! },
      include: { organization: true, ...accessInclude },
    });
    const dummyHash = "00000000000000000000000000000000:" + "0".repeat(128);
    const valid = verifyPassword(dto.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid || !user.active)
      throw new UnauthorizedException("账号、手机号或密码错误");
    const token = randomBytes(32).toString("hex");
    const days = Number(process.env.SESSION_DAYS || 7);
    const currentUser = await this.db.$transaction(async (tx) => {
      // 锁定账号，串行处理同一账号的并发登录，避免同时生成两个有效会话。
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: user.id },
        include: { organization: true, ...accessInclude },
      });
      if (!current?.active || current.passwordHash !== user.passwordHash)
        throw new UnauthorizedException("账号状态或密码已变更，请重新登录");
      // 新登录替换旧会话，关联的未完成授权状态随旧会话级联清理。
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.session.create({
        data: {
          id: tokenHash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + days * 86400000),
        },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        include: { organization: true, ...accessInclude },
      });
    });
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === "true"
        : process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: days * 86400000,
    });
    return userView(currentUser);
  }
  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthRequest) {
    return userView(
      await this.db.user.findUniqueOrThrow({
        where: { id: req.user.id },
        include: { organization: true, ...accessInclude },
      }),
    );
  }
  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.session.deleteMany({
      where: { id: tokenHash(req.cookies[cookieName]) },
    });
    res.clearCookie(cookieName, { path: "/" });
  }
  @Post("password")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async password(
    @Body() dto: PasswordDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!verifyPassword(dto.currentPassword, req.user.passwordHash))
      throw new ForbiddenException("当前密码错误");
    await this.db.$transaction([
      this.db.user.update({
        where: { id: req.user.id },
        data: { passwordHash: hashPassword(dto.newPassword) },
      }),
      this.db.session.deleteMany({ where: { userId: req.user.id } }),
    ]);
    res.clearCookie(cookieName, { path: "/" });
  }
}
