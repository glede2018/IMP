import { stableSlotValues } from "./workflow-slots.js";
import { randomUUID } from "node:crypto";
import { CreatKeyClient } from "./creatkey-client.js";
import {
  productViewPayload,
  viewJobField,
  viewAssetField,
} from "./product-views.js";
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
  IsObject,
  IsUUID,
} from "class-validator";
import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import { categoryPath, ensureDefaultCategory } from "./material-categories.js";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { SessionGuard, requireRole, AuthRequest } from "./auth.js";
class MaterialUploadQuery {
  @IsIn(["product", "person"]) type!: "product" | "person";
}
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
  @IsOptional() @IsString() @Length(1, 100) viewModelId?: string;
  @IsOptional() @IsObject() viewParameters?: Record<string, unknown>;
  @IsOptional() @IsUUID() viewRequestId?: string;
  @IsOptional() @IsString() @Length(1, 100) productViewModelId?: string;
  @IsOptional() @IsObject() productViewParameters?: Record<string, unknown>;
  @IsOptional() @IsUUID() productViewRequestId?: string;
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsIn(["product", "person"]) type!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(0, 500) description!: string;
  @IsOptional() @IsString() @Length(0, 500) materialDescription?: string;
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  categoryPath!: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  tags: string[] = [];
  @IsInt() @Min(0) @Max(999999999) priceCents!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fileIds!: string[];
  @IsOptional() @IsString() @Length(1, 100) voiceAssetId?: string;
  @IsOptional() @IsBoolean() isDefault = false;
}
const materialInclude = {
  files: { orderBy: { position: "asc" as const }, include: { asset: true } },
  productViewAsset: true,
  personViewAsset: true,
} as const;
export const materialView = async (
  storage: Storage,
  m: Prisma.MaterialGetPayload<{ include: typeof materialInclude }>,
) => ({
  id: m.id,
  type: m.type,
  name: m.name,
  description: m.description,
  materialDescription: m.materialDescription,
  categoryPath: m.categoryPath,
  categoryId: m.categoryId,
  tags: m.tags,
  priceCents: m.priceCents,
  creatorName: m.creatorName,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  generationStatus: m.generationStatus,
  personViewAssetId: m.personViewAssetId,
  personViewJobId: m.personViewJobId,
  personView: m.personViewAsset
    ? {
        id: m.personViewAsset.id,
        mimeType: m.personViewAsset.mimeType,
        size: m.personViewAsset.size,
        label: "人物三视图",
        url: (await storage.links(m.personViewAsset)).preview,
      }
    : null,
  productViewAssetId: m.productViewAssetId,
  productViewJobId: m.productViewJobId,
  productView: m.productViewAsset
    ? {
        id: m.productViewAsset.id,
        mimeType: m.productViewAsset.mimeType,
        size: m.productViewAsset.size,
        label: "产品三视图",
        url: (await storage.links(m.productViewAsset)).preview,
      }
    : null,
  files: await Promise.all(
    m.files.map(async (f) => ({
      id: f.assetId,
      label: f.label,
      mimeType: f.asset.mimeType,
      size: f.asset.size,
      url: (await storage.links(f.asset)).preview,
    })),
  ),
});
@Controller("materials")
@UseGuards(SessionGuard)
export class MaterialsController {
  constructor(
    private db: Database,
    private storage: Storage,
    private creatkey: CreatKeyClient,
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
                    { materialDescription: contains },
                  ],
          }
        : {}),
    };
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
      items: await Promise.all(items.map((m) => materialView(this.storage, m))),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post("files")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async file(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: MaterialUploadQuery,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    if (!file?.size)
      throw new BadRequestException("请选择图片，单张不超过 10 MB");
    const stored = await this.storage.upload(
      file,
      req.user.organizationId,
      "image",
      query.type,
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
        url: (await this.storage.links(a)).preview,
        mimeType: a.mimeType,
        size: a.size,
      };
    } catch (e) {
      await this.storage.remove(stored.objectKey).catch(() => undefined);
      throw e;
    }
  }
  private async persist(dto: MaterialDto, req: AuthRequest, id?: string) {
    requireRole(req);
    if (!dto.name.trim() || (dto.type === "product" && !dto.description.trim()))
      throw new BadRequestException("请填写素材标题和卖点");
    if (
      dto.type === "person" &&
      (dto.name.length > 30 ||
        dto.description.length > 100 ||
        !dto.fileIds.length)
    )
      throw new BadRequestException(
        "人物昵称不超过30字、简介不超过100字，需上传1至10张参考图",
      );
    if (dto.type === "product" && !dto.categoryPath.length && !dto.categoryId)
      throw new BadRequestException("请选择类目，可选择未分类");
    const generationModelId = dto.viewModelId || dto.productViewModelId;
    const generationParameters =
      dto.viewParameters || dto.productViewParameters || {};
    const generationRequestId = dto.viewRequestId || dto.productViewRequestId;
    const purpose = dto.type === "person" ? "person_views" : "product_views";
    const jobField = viewJobField(purpose),
      assetField = viewAssetField(purpose);
    // 先验证模型与全部参考图，保存和生成任务在同一事务内提交。
    const model = generationModelId
      ? (
          await this.creatkey.request<any[]>("/models", req.user.organizationId)
        ).find((m) => m.id === generationModelId)
      : null;
    if (generationModelId && !model)
      throw new BadRequestException("模型不存在或不可用");
    const viewPayload = model
      ? productViewPayload(model, dto.fileIds, generationParameters, dto.type)
      : null;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
      if (viewPayload && generationRequestId) {
        const saved = await tx.modelGeneration.findUnique({
          where: {
            organizationId_requestId: {
              organizationId: req.user.organizationId,
              requestId: generationRequestId,
            },
          },
        });
        if (saved) {
          const material = await tx.material.findFirst({
            where: {
              id: saved.materialId,
              organizationId: req.user.organizationId,
              deletedAt: null,
            },
            include: materialInclude,
          });
          if (
            saved.purpose !== purpose ||
            saved.modelId !== generationModelId ||
            !material ||
            (id && material.id !== id) ||
            material.name !== dto.name.trim() ||
            material.description !== dto.description ||
            material.materialDescription !==
              (dto.type === "product"
                ? (dto.materialDescription || "").trim()
                : "") ||
            material.priceCents !==
              (dto.type === "product" ? dto.priceCents : 0) ||
            (dto.categoryId && material.categoryId !== dto.categoryId) ||
            stableSlotValues(saved.payload) !== stableSlotValues(viewPayload)
          )
            throw new BadRequestException("请求已提交，请刷新后重试");
          return materialView(this.storage, material);
        }
      }
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
      if (id)
        await tx.$queryRaw`SELECT id FROM "Material" WHERE id=${id} AND "organizationId"=${req.user.organizationId} FOR UPDATE`;
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
              a.size > 10 * 1024 * 1024) &&
            !old?.files.some((f) => f.assetId === a.id),
        )
      )
        throw new BadRequestException(
          "仅支持单张不超过10MB的 JPG/PNG/WebP 图片",
        );
      await tx.asset.updateMany({
        where: { id: { in: dto.fileIds } },
        data: { retained: true },
      });
      const {
        viewModelId,
        viewParameters,
        viewRequestId,
        fileIds,
        voiceAssetId,
        isDefault,
        productViewModelId,
        productViewParameters,
        productViewRequestId,
        ...data
      } = dto;
      const referencesChanged =
        old &&
        JSON.stringify(old.files.map((f) => f.assetId)) !==
          JSON.stringify(fileIds);
      const fields = {
        ...(referencesChanged
          ? {
              [assetField]: null,
              [jobField]: null,
              generationStatus: "reference",
            }
          : {}),
        ...data,
        categoryId: selectedCategoryId,
        name: dto.name.trim(),
        tags: [],
        materialDescription:
          dto.type === "product" ? (dto.materialDescription || "").trim() : "",
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
                    old?.files.find((f) => f.assetId === assetId)?.label ||
                    (dto.type === "person" ? "参考图" : `主图${position + 1}`),
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
      if (viewPayload) {
        if (
          old?.[jobField] &&
          !referencesChanged &&
          (await tx.modelGeneration.count({
            where: {
              id: old[jobField]!,
              status: { in: ["queued", "running"] },
            },
          }))
        )
          throw new BadRequestException("三视图正在生成，请勿重复提交");
        const job = await tx.modelGeneration.create({
          data: {
            organizationId: req.user.organizationId,
            creatorId: req.user.id,
            materialId: m.id,
            modelId: generationModelId!,
            requestId: generationRequestId || randomUUID(),
            purpose,
            payload: viewPayload as Prisma.InputJsonValue,
          },
        });
        const queued = await tx.material.update({
          where: { id: m.id },
          data: {
            [jobField]: job.id,
            [assetField]: null,
            generationStatus: "generating",
          },
          include: materialInclude,
        });
        Object.assign(m, queued);
      }
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: old ? "material.update" : "material.create",
          entityId: m.id,
        },
      });
      return materialView(this.storage, m);
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
        data: { deletedAt: new Date() },
      });
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
