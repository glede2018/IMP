import {
  Controller,
  UseGuards,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  IsString,
  IsIn,
  Length,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsISO8601,
} from "class-validator";
import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import { categoryPath, ensureDefaultCategory } from "./material-categories.js";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { SessionGuard, requireRole, AuthRequest } from "./auth.js";
class MaterialQuery {
  @IsIn(["product", "person"]) type = "product";
  @IsOptional() @IsString() @Length(0, 120) q?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(["newest", "oldest"]) sort = "newest";
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 12;
}
class MaterialDto {
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsIn(["product", "person"]) type!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(0, 500) description!: string;
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  categoryPath!: string[];
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  tags!: string[];
  @IsInt() @Min(0) @Max(999999999) priceCents!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fileIds!: string[];
  @IsOptional() @IsString() @Length(1, 100) voiceAssetId?: string;
  @IsBoolean() isDefault!: boolean;
}
const materialInclude = {
  files: { orderBy: { position: "asc" as const }, include: { asset: true } },
  voiceAsset: true,
} as const;
export const materialView = (
  m: Prisma.MaterialGetPayload<{ include: typeof materialInclude }>,
) => ({
  id: m.id,
  type: m.type,
  name: m.name,
  description: m.description,
  categoryPath: m.categoryPath,
  categoryId: m.categoryId,
  tags: m.tags,
  priceCents: m.priceCents,
  creatorName: m.creatorName,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  isDefault: m.isDefault,
  generationStatus: m.generationStatus,
  voiceAssetId: m.voiceAssetId,
  voiceName: m.voiceAsset?.name,
  files: m.files.map((f) => ({
    id: f.assetId,
    label: f.label,
    mimeType: f.asset.mimeType,
    size: f.asset.size,
    url: `/api/v1/assets/${f.assetId}/file`,
  })),
});
@Controller("materials")
@UseGuards(SessionGuard)
export class MaterialsController {
  constructor(
    private db: Database,
    private storage: Storage,
  ) {}
  @Get() async list(@Query() q: MaterialQuery, @Req() req: AuthRequest) {
    if (q.from && q.to && new Date(q.from) > new Date(q.to))
      throw new BadRequestException("开始时间不能晚于结束时间");
    const contains = { contains: q.q, mode: "insensitive" as const };
    const where: Prisma.MaterialWhereInput = {
      organizationId: req.user.organizationId,
      type: q.type,
      deletedAt: null,
      createdAt: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined,
      },
      ...(q.q
        ? {
            OR:
              q.type === "person"
                ? [{ name: contains }]
                : [
                    { name: contains },
                    { description: contains },
                    { tags: { hasSome: [q.q] } },
                  ],
          }
        : {}),
    };
    // Tag matching includes partial matches, consistently with title and description search.
    if (q.q && q.type === "product") {
      const tagged = await this.db.material.findMany({
        where: {
          organizationId: req.user.organizationId,
          type: "product",
          deletedAt: null,
        },
        select: { id: true, tags: true },
      });
      where.OR!.push({
        id: {
          in: tagged
            .filter((m) =>
              m.tags.some((t) => t.toLowerCase().includes(q.q!.toLowerCase())),
            )
            .map((m) => m.id),
        },
      });
    }
    const [items, total] = await this.db.$transaction([
      this.db.material.findMany({
        where,
        include: materialInclude,
        orderBy: [
          { createdAt: q.sort === "oldest" ? "asc" : "desc" },
          { id: "asc" },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.material.count({ where }),
    ]);
    return {
      items: items.map(materialView),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get("voices") async voices(@Req() req: AuthRequest) {
    return (
      await this.db.asset.findMany({
        where: {
          organizationId: req.user.organizationId,
          type: "voice",
          mimeType: { startsWith: "audio/" },
        },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => ({
      id: a.id,
      name: a.name,
      sampleUrl: `/api/v1/assets/${a.id}/file`,
    }));
  }
  @Get("capabilities") capabilities() {
    return {
      digitalHumanReady: false,
      reason:
        "尚未配置数字人引擎，请先保存参考形象；多角度生成需要接入服务商。",
      referenceGenerationReady: false,
    };
  }
  @Post("files")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async file(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    if (!file?.size)
      throw new BadRequestException("请选择图片，单张不超过 3 MB");
    const stored = await this.storage.upload(
      file,
      req.user.organizationId,
      "image",
    );
    try {
      const a = await this.db.asset.create({
        data: {
          ...stored,
          organizationId: req.user.organizationId,
          type: "image",
          name: file.originalname.slice(0, 200),
        },
      });
      return {
        id: a.id,
        url: `/api/v1/assets/${a.id}/file`,
        mimeType: a.mimeType,
        size: a.size,
      };
    } catch (e) {
      await this.storage.remove(stored.objectKey).catch(() => undefined);
      throw e;
    }
  }
  @Post(":id/generate") async generate(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    if (
      !(await this.db.material.findFirst({
        where: {
          id,
          organizationId: req.user.organizationId,
          type: "person",
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException("人物素材不存在");
    throw new ServiceUnavailableException(
      "尚未配置数字人引擎，不能生成多角度形象",
    );
  }
  private async persist(dto: MaterialDto, req: AuthRequest, id?: string) {
    requireRole(req);
    if (!dto.name.trim() || (dto.type === "product" && !dto.description.trim()))
      throw new BadRequestException("请填写素材标题和卖点");
    if (
      dto.type === "person" &&
      (dto.name.length > 30 ||
        dto.description.length > 100 ||
        dto.fileIds.length !== 1 ||
        !dto.voiceAssetId)
    )
      throw new BadRequestException(
        "人物昵称不超过30字、简介不超过100字，需一张参考图和音色",
      );
    if (dto.type === "product" && !dto.categoryPath.length && !dto.categoryId)
      throw new BadRequestException("请选择类目，可选择未分类");
    if (dto.type === "product" && dto.isDefault)
      throw new BadRequestException("产品素材不能设为默认人物");
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
      let selectedCategoryId: string | null = null;
      if (dto.type === "product") {
        let rows = await tx.materialCategory.findMany({
          where: { organizationId: req.user.organizationId },
        });
        if (!rows.some((r) => r.system)) {
          await ensureDefaultCategory(tx, req.user.organizationId);
          rows = await tx.materialCategory.findMany({
            where: { organizationId: req.user.organizationId },
          });
        }
        let selected = dto.categoryId
          ? rows.find((r) => r.id === dto.categoryId)
          : undefined;
        if (!dto.categoryId) {
          selected = rows.find(
            (r) =>
              JSON.stringify(categoryPath(rows, r.id).map((p) => p.name)) ===
              JSON.stringify(
                dto.categoryPath.length ? dto.categoryPath : ["未分类"],
              ),
          );
        }
        if (!selected)
          throw new BadRequestException("分类已变更或不存在，请重新选择");
        selectedCategoryId = selected.id;
        dto.categoryPath = categoryPath(rows, selected.id).map((p) => p.name);
      }
      const old = id
        ? await tx.material.findFirst({
            where: {
              id,
              organizationId: req.user.organizationId,
              deletedAt: null,
            },
            include: materialInclude,
          })
        : null;
      if (id && !old) throw new NotFoundException("素材不存在");
      if (old && old.type !== dto.type)
        throw new BadRequestException("不能修改素材分类");
      if (new Set(dto.fileIds).size !== dto.fileIds.length)
        throw new BadRequestException("不能重复选择图片");
      const assets = await tx.asset.findMany({
        where: {
          organizationId: req.user.organizationId,
          id: { in: dto.fileIds },
        },
      });
      if (assets.length !== dto.fileIds.length)
        throw new BadRequestException("图片不存在");
      if (
        assets.some(
          (a) =>
            (!["image/jpeg", "image/png", "image/webp"].includes(a.mimeType) ||
              a.size > 3 * 1024 * 1024) &&
            !old?.files.some((f) => f.assetId === a.id),
        )
      )
        throw new BadRequestException(
          "仅支持单张不超过3MB的 JPG/PNG/WebP 图片",
        );
      if (
        dto.voiceAssetId &&
        !(await tx.asset.findFirst({
          where: {
            id: dto.voiceAssetId,
            organizationId: req.user.organizationId,
            type: "voice",
            mimeType: { startsWith: "audio/" },
          },
        }))
      )
        throw new BadRequestException("音色不存在，请配置音色列表");
      if (
        dto.type === "person" &&
        !(await tx.material.count({
          where: {
            organizationId: req.user.organizationId,
            type: "person",
            deletedAt: null,
          },
        }))
      )
        dto.isDefault = true;
      await tx.asset.updateMany({
        where: {
          id: {
            in: [
              ...dto.fileIds,
              ...(dto.voiceAssetId ? [dto.voiceAssetId] : []),
            ],
          },
        },
        data: { retained: true },
      });
      if (dto.isDefault)
        await tx.material.updateMany({
          where: {
            organizationId: req.user.organizationId,
            type: "person",
            isDefault: true,
            deletedAt: null,
          },
          data: { isDefault: false },
        });
      const { fileIds, ...data } = dto;
      const fields = {
        ...data,
        categoryId: selectedCategoryId,
        name: dto.name.trim(),
        voiceAssetId: dto.type === "person" ? dto.voiceAssetId : null,
        categoryPath: dto.type === "product" ? dto.categoryPath : [],
        priceCents: dto.type === "product" ? dto.priceCents : 0,
      };
      const m = old
        ? await tx.material.update({
            where: { id },
            data: {
              ...fields,
              files: {
                deleteMany: {},
                create: fileIds.map((assetId, position) => ({
                  assetId,
                  position,
                  label:
                    dto.type === "person" ? "参考图" : `主图${position + 1}`,
                })),
              },
            },
            include: materialInclude,
          })
        : await tx.material.create({
            data: {
              ...fields,
              organizationId: req.user.organizationId,
              creatorId: req.user.id,
              creatorName: req.user.name,
              files: {
                create: fileIds.map((assetId, position) => ({
                  assetId,
                  position,
                  label:
                    dto.type === "person" ? "参考图" : `主图${position + 1}`,
                })),
              },
            },
            include: materialInclude,
          });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: old ? "material.update" : "material.create",
          entityId: m.id,
        },
      });
      return materialView(m);
    });
  }
  @Post() create(@Body() dto: MaterialDto, @Req() req: AuthRequest) {
    return this.persist(dto, req);
  }
  @Put(":id") update(
    @Param("id") id: string,
    @Body() dto: MaterialDto,
    @Req() req: AuthRequest,
  ) {
    return this.persist(dto, req, id);
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
      const m = await tx.material.findFirst({
        where: { id, organizationId: req.user.organizationId, deletedAt: null },
      });
      if (!m) throw new NotFoundException("素材不存在");
      await tx.material.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (m.isDefault) {
        const next = await tx.material.findFirst({
          where: {
            organizationId: req.user.organizationId,
            type: "person",
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
        });
        if (next)
          await tx.material.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
      }
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: "material.delete",
          entityId: id,
        },
      });
    });
    return { success: true };
  }
}
