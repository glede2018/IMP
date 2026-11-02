import {
  Controller,
  UseGuards,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import {
  IsString,
  Length,
  Matches,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
} from "class-validator";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { AuthRequest, SessionGuard, userView } from "./auth.js";
import {
  accessInclude,
  permissionsFor,
  hasPermission,
  permissionCatalog,
} from "./permissions.js";
import { hashPassword } from "./security.js";
class RoleDto {
  @IsString() @Length(1, 60) name!: string;
  @Matches(/^[a-z][a-z0-9_]{1,49}$/) code!: string;
  @IsString() @Length(0, 500) description!: string;
  @IsInt() @Min(0) @Max(9999) sort!: number;
  @IsBoolean() active!: boolean;
}
class GrantsDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) permissions!: string[];
}
class RolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleIds!: string[];
}
class UserDto {
  @Matches(/^[a-zA-Z0-9_]{3,50}$/) username!: string;
  @IsString() @Length(1, 100) name!: string;
  @Matches(/^1[3-9]\d{9}$/) phone!: string;
  @IsBoolean() active!: boolean;
}
class CreateUserDto extends UserDto {
  @IsString() @Length(12, 128) password!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleIds!: string[];
}
class ResetDto {
  @IsString() @Length(12, 128) password!: string;
}
@Controller("permissions")
@UseGuards(SessionGuard)
export class AccessController {
  constructor(private db: Database) {}
  private permit(req: AuthRequest, key: string) {
    if (!hasPermission(permissionsFor(req.user), key))
      throw new ForbiddenException("没有此管理权限");
  }
  private async change<T>(
    req: AuthRequest,
    action: string,
    id: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      // Serialize permission mutations per organization, including last administrator checks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId}))`;
      const actor = await tx.user.findUniqueOrThrow({
        where: { id: req.user.id },
        include: accessInclude,
      });
      if (
        !actor.active ||
        !hasPermission(
          permissionsFor(actor),
          action.startsWith("role.") ? "roles" : "users",
        )
      )
        throw new ForbiddenException("管理权限已变更");
      req.user = actor;
      const result = await fn(tx);
      const admins = await tx.user.count({
        where: {
          organizationId: req.user.organizationId,
          active: true,
          assignments: {
            some: {
              role: { system: true, active: true, permissions: { has: "*" } },
            },
          },
        },
      });
      if (!admins) throw new ConflictException("至少保留一位启用的超级管理员");
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action,
          entityId: id,
        },
      });
      return result;
    });
  }
  private async role(
    tx: Prisma.TransactionClient,
    id: string,
    req: AuthRequest,
  ) {
    const r = await tx.accessRole.findFirst({
      where: { id, organizationId: req.user.organizationId },
    });
    if (!r) throw new NotFoundException("角色不存在");
    return r;
  }
  private async member(
    tx: Prisma.TransactionClient,
    id: string,
    req: AuthRequest,
  ) {
    const u = await tx.user.findFirst({
      where: { id, organizationId: req.user.organizationId },
      include: accessInclude,
    });
    if (!u) throw new NotFoundException("用户不存在");
    if (
      id !== req.user.id &&
      !hasPermission(permissionsFor(req.user), "*") &&
      permissionsFor(u).some((p) => !hasPermission(permissionsFor(req.user), p))
    )
      throw new ForbiddenException("不能管理权限高于自己的用户");
    return u;
  }
  private async validateRoles(
    tx: Prisma.TransactionClient,
    ids: string[],
    req: AuthRequest,
  ) {
    if (
      new Set(ids).size !== ids.length ||
      (await tx.accessRole.count({
        where: {
          id: { in: ids },
          organizationId: req.user.organizationId,
          active: true,
        },
      })) !== ids.length
    )
      throw new BadRequestException("请选择本组织启用的角色");
    if (!hasPermission(permissionsFor(req.user), "*")) {
      const roles = await tx.accessRole.findMany({
        where: { id: { in: ids } },
      });
      if (
        roles.some((r) =>
          r.permissions.some(
            (p) => !hasPermission(permissionsFor(req.user), p),
          ),
        )
      )
        throw new ForbiddenException("不能授予超出自身范围的权限");
    }
  }
  @Get("catalog") catalog(@Req() req: AuthRequest) {
    if (
      !["roles", "users"].some((k) =>
        hasPermission(permissionsFor(req.user), k),
      )
    )
      throw new ForbiddenException();
    return permissionCatalog.map(([key, label]) => ({ key, label }));
  }
  @Get("roles") async roles(@Req() req: AuthRequest) {
    if (
      !["roles", "users"].some((k) =>
        hasPermission(permissionsFor(req.user), k),
      )
    )
      throw new ForbiddenException();
    return this.db.accessRole.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { users: true } } },
    });
  }
  @Post("roles") async createRole(
    @Body() dto: RoleDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "roles");
    return this.change(req, "role.create", dto.code, (tx) =>
      tx.accessRole.create({
        data: { ...dto, organizationId: req.user.organizationId },
      }),
    );
  }
  @Put("roles/:id") async updateRole(
    @Param("id") id: string,
    @Body() dto: RoleDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "roles");
    return this.change(req, "role.update", id, async (tx) => {
      const r = await this.role(tx, id, req);
      if (r.system)
        throw new BadRequestException("系统角色由系统维护，不能修改");
      if (
        await tx.userRole.count({ where: { roleId: id, userId: req.user.id } })
      )
        throw new BadRequestException("不能修改自己所属角色");
      if (
        !hasPermission(permissionsFor(req.user), "*") &&
        r.permissions.some((p) => !hasPermission(permissionsFor(req.user), p))
      )
        throw new ForbiddenException("不能管理权限高于自己的角色");
      return tx.accessRole.update({ where: { id }, data: dto });
    });
  }
  @Put("roles/:id/permissions") async grant(
    @Param("id") id: string,
    @Body() dto: GrantsDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "roles");
    const known = new Set<string>(permissionCatalog.map(([key]) => key));
    if (dto.permissions.some((p) => !known.has(p)))
      throw new BadRequestException("权限项无效");
    if (
      !hasPermission(permissionsFor(req.user), "*") &&
      dto.permissions.some((p) => !hasPermission(permissionsFor(req.user), p))
    )
      throw new ForbiddenException("不能分配超出自身范围的权限");
    // Write capabilities always require the corresponding menu.
    if (
      dto.permissions.some(
        (p) => p.includes(":") && !dto.permissions.includes(p.split(":")[0]),
      )
    )
      throw new BadRequestException("操作权限需要同时勾选对应菜单");
    return this.change(req, "role.permissions", id, async (tx) => {
      const r = await this.role(tx, id, req);
      if (r.system) throw new BadRequestException("系统角色拥有全部权限");
      if (
        !hasPermission(permissionsFor(req.user), "*") &&
        r.permissions.some((p) => !hasPermission(permissionsFor(req.user), p))
      )
        throw new ForbiddenException("不能管理权限高于自己的角色");
      if (
        await tx.userRole.count({ where: { roleId: id, userId: req.user.id } })
      )
        throw new BadRequestException("不能修改自己所属角色的权限");
      return tx.accessRole.update({
        where: { id },
        data: { permissions: [...new Set(dto.permissions)] },
      });
    });
  }
  @Delete("roles/:id") async deleteRole(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "roles");
    return this.change(req, "role.delete", id, async (tx) => {
      if ((await this.role(tx, id, req)).system)
        throw new BadRequestException("系统角色不能删除");
      if (await tx.userRole.count({ where: { roleId: id } }))
        throw new ConflictException("角色仍有用户，请先重新分配");
      await tx.accessRole.delete({ where: { id } });
      return { success: true };
    });
  }
  @Get("users") async users(@Req() req: AuthRequest) {
    this.permit(req, "users");
    return (
      await this.db.user.findMany({
        where: { organizationId: req.user.organizationId },
        include: accessInclude,
        orderBy: { createdAt: "asc" },
      })
    ).map(userView);
  }
  @Post("users") async createUser(
    @Body() dto: CreateUserDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "users");
    const { password, roleIds, ...data } = dto;
    return this.change(req, "user.create", dto.username, async (tx) => {
      await this.validateRoles(tx, roleIds, req);
      return userView(
        await tx.user.create({
          data: {
            ...data,
            role: "viewer",
            organizationId: req.user.organizationId,
            passwordHash: hashPassword(password),
            assignments: { create: roleIds.map((roleId) => ({ roleId })) },
          },
          include: accessInclude,
        }),
      );
    });
  }
  @Put("users/:id") async updateUser(
    @Param("id") id: string,
    @Body() dto: UserDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "users");
    return this.change(req, "user.update", id, async (tx) => {
      await this.member(tx, id, req);
      if (id === req.user.id && !dto.active)
        throw new BadRequestException("不能停用自己");
      const u = await tx.user.update({
        where: { id },
        data: dto,
        include: accessInclude,
      });
      if (!dto.active) await tx.session.deleteMany({ where: { userId: id } });
      return userView(u);
    });
  }
  @Put("users/:id/roles") async assign(
    @Param("id") id: string,
    @Body() dto: RolesDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "users");
    return this.change(req, "user.roles", id, async (tx) => {
      await this.member(tx, id, req);
      if (id === req.user.id)
        throw new BadRequestException("不能修改自己的角色");
      await this.validateRoles(tx, dto.roleIds, req);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
      });
      await tx.session.deleteMany({ where: { userId: id } });
      return { success: true };
    });
  }
  @Put("users/:id/password") async reset(
    @Param("id") id: string,
    @Body() dto: ResetDto,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "users");
    return this.change(req, "user.password", id, async (tx) => {
      await this.member(tx, id, req);
      await tx.user.update({
        where: { id },
        data: { passwordHash: hashPassword(dto.password) },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      return { success: true };
    });
  }
  @Delete("users/:id") async deleteUser(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    this.permit(req, "users");
    return this.change(req, "user.delete", id, async (tx) => {
      await this.member(tx, id, req);
      if (id === req.user.id) throw new BadRequestException("不能删除自己");
      await tx.user.delete({ where: { id } });
      return { success: true };
    });
  }
}
