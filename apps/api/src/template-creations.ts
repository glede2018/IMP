import { isWorkflow, validateWorkflowConfig } from "./workflow-definition.js";
import {
  selectedWorkflowMaterials,
  applyWorkflowSlots,
  stableSlotValues,
  templateMaterialFiles,
} from "./workflow-slots.js";
import { WorkflowEngine } from "./workflow-engine.js";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import {
  IsString,
  Length,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ArrayMinSize,
  IsInt,
  Min,
  IsUUID,
  IsOptional,
  IsObject,
} from "class-validator";
import type { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { AuthRequest, SessionGuard } from "./auth.js";
import { hasPermission, permissionsFor } from "./permissions.js";
const permission = (req: AuthRequest, key: string) => {
  if (!hasPermission(permissionsFor(req.user), key))
    throw new ForbiddenException("没有此操作权限");
};
export class CreationDto {
  @IsString() @Length(1, 50) title!: string;
  @IsInt() @Min(1) revision!: number;
  @IsOptional() @IsString() @Length(1, 100) personMaterialId!: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  productMaterialIds!: string[];
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  tagIds!: string[];
  @IsUUID() requestId!: string;
  @IsOptional() @IsObject() slotValues?: Record<string, any>;
}
@Controller("templates")
@UseGuards(SessionGuard)
export class TemplateCreationsController {
  constructor(
    private db: Database,
    private storage: Storage,
    private engine: WorkflowEngine,
  ) {}
  private async context(
    tx: Prisma.TransactionClient,
    req: AuthRequest,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "Template" WHERE id=${id} AND "organizationId"=${req.user.organizationId} FOR SHARE`;
    const template = await tx.template.findFirst({
      where: { id, organizationId: req.user.organizationId },
      include: { coverAsset: true },
    });
    if (!template) throw new NotFoundException("模板不存在");
    if (!template.active)
      throw new ConflictException("模板已下架，请选择其他模板");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":tags"}))`;
    const { coverAsset, ...templateData } = template;
    return {
      template: {
        ...templateData,
        config: isWorkflow(templateData.config)
          ? validateWorkflowConfig(templateData.config)
          : templateData.config,
        cover: coverAsset
          ? (await this.storage.links(coverAsset)).preview
          : null,
      },
    };
  }
  @Post(":id/prepare") prepare(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    permission(req, "works:write");
    return this.db.$transaction(async (tx) => {
      const context = await this.context(tx, req, id);
      const tags = await tx.templateTrackingTag.findMany({
        where: {
          organizationId: req.user.organizationId,
          active: true,
          deletedAt: null,
          systemGenerated: false,
        },
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      });
      return {
        ...context,
        tags,
        execution: this.engine.availability(context.template.config),
      };
    });
  }
  @Get("creation-materials") async materials(
    @Query("type") type: string,
    @Query("q") q: string | undefined,
    @Req() req: AuthRequest,
  ) {
    permission(req, "assets");
    if (
      !["person", "product"].includes(type) ||
      (q !== undefined && (typeof q !== "string" || q.length > 120))
    )
      throw new BadRequestException("素材筛选参数无效");
    const rows = await this.db.material.findMany({
      where: {
        organizationId: req.user.organizationId,
        deletedAt: null,
        type,
        ...(type === "product"
          ? { productViewAssetId: { not: null } }
          : { personViewAssetId: { not: null } }),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
      include: {
        files: { orderBy: { position: "asc" }, include: { asset: true } },
        productViewAsset: true,
        personViewAsset: true,
      },
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        materialDescription: r.materialDescription,
        type: r.type,
        files: await Promise.all(
          templateMaterialFiles(r).map(async (f) => ({
            id: f.asset.id,
            url: (await this.storage.links(f.asset)).preview,
            label: f.label,
            mimeType: f.asset.mimeType,
          })),
        ),
      })),
    );
  }
  @Post(":id/creations") create(
    @Param("id") id: string,
    @Body() dto: CreationDto,
    @Req() req: AuthRequest,
  ) {
    permission(req, "works:write");
    permission(req, "assets");
    const title = dto.title.trim();
    if (!title) throw new BadRequestException("请输入视频名称");
    return this.db.$transaction(async (tx) => {
      const { template } = await this.context(tx, req, id);
      const selected = selectedWorkflowMaterials(
        template.config,
        dto.slotValues,
      );
      if (
        !selected &&
        (!dto.personMaterialId || !dto.productMaterialIds?.length)
      )
        throw new BadRequestException("请选择人物和产品素材");
      const ids = selected?.ids || [
        dto.personMaterialId,
        ...dto.productMaterialIds,
      ];
      const existing = await tx.videoCreationDraft.findUnique({
        where: {
          organizationId_requestId: {
            organizationId: req.user.organizationId,
            requestId: dto.requestId,
          },
        },
      });
      if (existing) {
        if (
          (selected
            ? stableSlotValues(
                (existing.templateSnapshot as any).slotValues,
              ) !== stableSlotValues(dto.slotValues)
            : (
                existing.materialSnapshot as { id: string; type: string }[]
              ).find((m) => m.type === "person")?.id !==
              dto.personMaterialId) ||
          JSON.stringify(
            (existing.materialSnapshot as { id: string }[])
              .map((m) => m.id)
              .sort(),
          ) !== JSON.stringify([...ids].sort()) ||
          existing.creatorId !== req.user.id ||
          existing.templateId !== id ||
          existing.title !== title ||
          existing.revision !== dto.revision ||
          JSON.stringify([...existing.contentTagIds].sort()) !==
            JSON.stringify([...dto.tagIds].sort())
        )
          throw new ConflictException("请求已保存，请刷新后重试");
        return existing;
      }
      if (template.revision !== dto.revision)
        throw new ConflictException("模板已更新，请重新选择模板后生成");
      const tags = await tx.templateTrackingTag.findMany({
        where: {
          id: { in: dto.tagIds },
          organizationId: req.user.organizationId,
          systemGenerated: false,
          active: true,
          deletedAt: null,
        },
      });
      if (tags.length !== dto.tagIds.length)
        throw new BadRequestException(
          "部分内容标签已停用、删除或不可用，请重新选择",
        );
      await tx.$queryRaw`SELECT id FROM "Material" WHERE id = ANY(${ids}::text[]) AND "organizationId"=${req.user.organizationId} FOR SHARE`;
      const materials = await tx.material.findMany({
        where: {
          id: { in: ids },
          organizationId: req.user.organizationId,
          deletedAt: null,
        },
        include: {
          productViewAsset: { select: { id: true, mimeType: true } },
          personViewAsset: { select: { id: true, mimeType: true } },
          files: {
            orderBy: { position: "asc" },
            include: { asset: { select: { id: true, mimeType: true } } },
          },
        },
      });
      if (
        materials.length !== ids.length ||
        materials.some(
          (m) =>
            (!selected &&
              m.type !==
                (m.id === dto.personMaterialId ? "person" : "product")) ||
            !templateMaterialFiles(m).length,
        )
      )
        throw new BadRequestException("请选择已生成三视图的人物和产品素材");
      const workflow = selected
        ? applyWorkflowSlots(selected, materials)
        : null;
      const available = this.engine.availability(template.config);
      const publishTags = dto.tagIds.map(
        (id) => tags.find((t) => t.id === id)!.name,
      );
      // 只记录所选发布标签与模板的关联，不创建新的话题标签。
      for (const tag of tags)
        await tx.templateTagBinding.upsert({
          where: {
            tagId_templateId_version: {
              tagId: tag.id,
              templateId: id,
              version: `v${template.revision}`,
            },
          },
          create: {
            organizationId: req.user.organizationId,
            tagId: tag.id,
            templateId: id,
            version: `v${template.revision}`,
            titleSnapshot: template.title,
          },
          update: {},
        });
      const draft = await tx.videoCreationDraft.create({
        data: {
          organizationId: req.user.organizationId,
          creatorId: req.user.id,
          templateId: id,
          revision: template.revision,
          title,
          contentTagIds: dto.tagIds,
          publishTags,
          requestId: dto.requestId,
          ...(workflow
            ? {
                workflowSnapshot: workflow as any,
                status: available.ready ? "queued" : "awaiting_provider",
                error: available.reason,
              }
            : {}),
          templateSnapshot: {
            title: template.title,
            revision: template.revision,
            config: template.config,
            ...(selected ? { slotValues: dto.slotValues } : {}),
          },
          materialSnapshot: materials.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            description: m.description,
            materialDescription: m.materialDescription,
            voiceAssetId: m.voiceAssetId,
            files: templateMaterialFiles(m).map((f) => ({
              assetId: f.asset.id,
              mimeType: f.asset.mimeType,
              label: f.label,
            })),
          })),
        },
      });
      await tx.asset.updateMany({
        where: {
          id: {
            in: materials.flatMap((m) => [
              ...templateMaterialFiles(m).map((f) => f.asset.id),
              ...(m.voiceAssetId ? [m.voiceAssetId] : []),
            ]),
          },
        },
        data: { retained: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action: "videoCreation.save",
          entityId: draft.id,
        },
      });
      return draft;
    });
  }
}
