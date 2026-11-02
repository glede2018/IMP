import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Req,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { IsString, Length, IsOptional, IsInt, Min, Max } from "class-validator";
import type { Prisma, MaterialCategory } from "@prisma/client";
import { Database } from "./database.js";
import { AuthRequest, SessionGuard, requireRole } from "./auth.js";
export class CategoryDto {
  @IsString() @Length(1, 60) name!: string;
  @IsOptional() @IsString() @Length(1, 100) parentId?: string | null;
  @IsInt() @Min(0) @Max(9999) sort!: number;
}
export function categoryPath(rows: MaterialCategory[], id: string) {
  const path: MaterialCategory[] = [];
  const seen = new Set<string>();
  let current = rows.find((r) => r.id === id);
  if (!current) throw new BadRequestException("分类不存在");
  while (current) {
    if (seen.has(current.id) || path.length >= 5)
      throw new BadRequestException("分类最多五级，不能形成循环");
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId
      ? rows.find((r) => r.id === current!.parentId)
      : undefined;
  }
  return path;
}
export async function ensureDefaultCategory(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const id = "default_category_" + organizationId;
  return tx.materialCategory.upsert({
    where: { id },
    create: { id, organizationId, name: "未分类", system: true, sort: 0 },
    update: {},
  });
}
@Controller("material-categories")
@UseGuards(SessionGuard)
export class MaterialCategoriesController {
  constructor(private db: Database) {}
  @Get() async list(@Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
      if (
        !(await tx.materialCategory.findFirst({
          where: { organizationId: req.user.organizationId, system: true },
        }))
      )
        await ensureDefaultCategory(tx, req.user.organizationId);
      return tx.materialCategory.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
        include: {
          _count: { select: { materials: { where: { deletedAt: null } } } },
        },
      });
    });
  }
  private async mutate(
    req: AuthRequest,
    action: string,
    fn: (
      tx: Prisma.TransactionClient,
      rows: MaterialCategory[],
    ) => Promise<unknown>,
  ) {
    requireRole(req);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
      if (
        !(await tx.materialCategory.findFirst({
          where: { organizationId: req.user.organizationId, system: true },
        }))
      )
        await ensureDefaultCategory(tx, req.user.organizationId);
      const rows = await tx.materialCategory.findMany({
        where: { organizationId: req.user.organizationId },
      });
      const result = await fn(tx, rows);
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action,
          entityId: (result as { id: string }).id,
        },
      });
      return result;
    });
  }
  @Post() create(@Body() dto: CategoryDto, @Req() req: AuthRequest) {
    return this.mutate(req, "category.create", async (tx, rows) => {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("请输入分类名称");
      if (dto.parentId) {
        const path = categoryPath(rows, dto.parentId);
        if (path.some((r) => r.system))
          throw new BadRequestException("未分类下不能新增子分类");
        if (path.length >= 5) throw new BadRequestException("分类最多五级");
      }
      if (
        rows.some(
          (r) => r.name === name && r.parentId === (dto.parentId || null),
        )
      )
        throw new ConflictException("同级分类名称已存在");
      return tx.materialCategory.create({
        data: {
          name,
          parentId: dto.parentId || null,
          sort: dto.sort,
          organizationId: req.user.organizationId,
        },
      });
    });
  }
  @Put(":id") update(
    @Param("id") id: string,
    @Body() dto: CategoryDto,
    @Req() req: AuthRequest,
  ) {
    return this.mutate(req, "category.update", async (tx, rows) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new NotFoundException("分类不存在");
      if (row.system)
        throw new BadRequestException("未分类由系统保留，不能修改");
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("请输入分类名称");
      if (
        dto.parentId &&
        categoryPath(rows, dto.parentId).some((r) => r.system)
      )
        throw new BadRequestException("不能移入未分类");
      if (
        rows.some(
          (r) =>
            r.id !== id &&
            r.name === name &&
            r.parentId === (dto.parentId || null),
        )
      )
        throw new ConflictException("同级分类名称已存在");
      const proposed = rows.map((r) =>
        r.id === id ? { ...r, name, parentId: dto.parentId || null } : r,
      );
      for (const r of proposed) categoryPath(proposed, r.id);
      const result = await tx.materialCategory.update({
        where: { id },
        data: { name, parentId: dto.parentId || null, sort: dto.sort },
      });
      for (const r of proposed) {
        const path = categoryPath(proposed, r.id);
        if (path.some((p) => p.id === id))
          await tx.material.updateMany({
            where: {
              organizationId: req.user.organizationId,
              categoryId: r.id,
              deletedAt: null,
            },
            data: { categoryPath: path.map((p) => p.name) },
          });
      }
      return result;
    });
  }
  @Delete(":id") remove(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.mutate(req, "category.delete", async (tx, rows) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new NotFoundException("分类不存在");
      if (row.system) throw new BadRequestException("未分类不能删除");
      if (rows.some((r) => r.parentId === id))
        throw new ConflictException("请先删除或移动子分类");
      if (
        await tx.material.count({
          where: {
            organizationId: req.user.organizationId,
            categoryId: id,
            deletedAt: null,
          },
        })
      )
        throw new ConflictException("分类仍被素材使用，请先调整素材分类");
      await tx.materialCategory.delete({ where: { id } });
      return { id, success: true };
    });
  }
}
