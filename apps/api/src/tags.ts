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
  Query,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import {
  IsString,
  Length,
  Matches,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from "class-validator";
import { Database } from "./database.js";
import { AuthRequest, SessionGuard, requireRole } from "./auth.js";
import { normalizeTrackingTag } from "./douyin-data-provider.js";
import type { Prisma } from "@prisma/client";
export class TagDto {
  @IsString() @Length(1, 100) name!: string;
  @IsString() @Length(1, 60) @Matches(/^[A-Z0-9_]+$/) code!: string;
  @IsString() @Length(0, 200) description!: string;
  @IsInt() @Min(0) @Max(9999) sort!: number;
  @IsBoolean() active!: boolean;
}
const clean = (v: TagDto) => {
  let tag: string;
  try {
    tag = normalizeTrackingTag(v.name);
  } catch {
    throw new BadRequestException(
      "标签名称仅支持中英文、数字和下划线，最多100字符，可带开头的 #",
    );
  }
  return {
    name: v.name.trim().replace(/^#/, ""),
    tag,
    code: v.code,
    description: v.description.trim(),
    sort: v.sort,
    active: v.active,
  };
};
@Controller("tags")
@UseGuards(SessionGuard)
export class TagsController {
  constructor(private db: Database) {}
  @Get() async list(
    @Req() req: AuthRequest,
    @Query() q: Record<string, string>,
  ) {
    if (Object.values(q).some((v) => typeof v !== "string" || v.length > 200))
      throw new BadRequestException("筛选参数无效");
    const page = Math.max(1, Math.min(100000, Number(q.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Number(q.pageSize) || 10));
    if (!Number.isInteger(page) || !Number.isInteger(pageSize))
      throw new BadRequestException("分页参数无效");
    if (q.active && !["true", "false"].includes(q.active))
      throw new BadRequestException("状态无效");
    const where: Prisma.TemplateTrackingTagWhereInput = {
      organizationId: req.user.organizationId,
      deletedAt: null,
      ...(q.name
        ? {
            name: {
              contains: q.name.trim().slice(0, 100),
              mode: "insensitive",
            },
          }
        : {}),
      ...(q.code
        ? {
            code: { contains: q.code.trim().slice(0, 60), mode: "insensitive" },
          }
        : {}),
      ...(q.active ? { active: q.active === "true" } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.templateTrackingTag.findMany({
        where,
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.templateTrackingTag.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  private async find(
    tx: Prisma.TransactionClient,
    req: AuthRequest,
    id: string,
  ) {
    const tag = await tx.templateTrackingTag.findFirst({
      where: { id, organizationId: req.user.organizationId, deletedAt: null },
    });
    if (!tag) throw new NotFoundException("标签不存在");
    return tag;
  }
  private mutate(
    req: AuthRequest,
    action: string,
    fn: (tx: Prisma.TransactionClient) => Promise<{ id: string }>,
  ) {
    requireRole(req);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":tags"}))`;
      const result = await fn(tx);
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action,
          entityId: result.id,
        },
      });
      return result;
    });
  }
  @Post() create(@Req() req: AuthRequest, @Body() dto: TagDto) {
    return this.mutate(req, "tag.create", (tx) =>
      tx.templateTrackingTag.create({
        data: { ...clean(dto), organizationId: req.user.organizationId },
      }),
    );
  }
  @Put(":id") update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: TagDto,
  ) {
    return this.mutate(req, "tag.update", async (tx) => {
      const row = await this.find(tx, req, id),
        data = clean(dto);
      if (row.templateId && row.tag !== data.tag)
        throw new ConflictException(
          "该标签已关联模板版本，不能更换发布 tag；请新增标签以保留历史关联。",
        );
      return tx.templateTrackingTag.update({ where: { id }, data });
    });
  }
  @Delete(":id") remove(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.mutate(req, "tag.delete", async (tx) => {
      await this.find(tx, req, id);
      return tx.templateTrackingTag.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });
    });
  }
}
