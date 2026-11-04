import { isWorkflow, validateWorkflowConfig } from "./workflow-definition.js";
import {
  selectedWorkflowMaterials,
  applyWorkflowSlots,
  stableSlotValues,
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":tags"}))`;
    const tag = `imp_${template.id}_v${template.revision}`.toLowerCase();
    const trackingTag = await tx.templateTrackingTag.upsert({
      where: {
        organizationId_tag: { organizationId: req.user.organizationId, tag },
      },
      create: {
        organizationId: req.user.organizationId,
        templateId: id,
        version: `v${template.revision}`,
        tag,
        name: tag,
        code: `TPL_${template.id.toUpperCase()}_V${template.revision}`,
        titleSnapshot: template.title,
        description: "视频发布时携带，用于识别模板版本",
      },
      update: {},
    });
    if (
      trackingTag.templateId !== id ||
      trackingTag.version !== `v${template.revision}`
    )
      throw new ConflictException("模板关联标签冲突，请联系管理员");
    if (!trackingTag.active || trackingTag.deletedAt)
      throw new ConflictException(
        "该模板关联标签已停用或删除，请先在标签管理恢复可用状态，或更新模板版本",
      );
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
      trackingTag,
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
          templateId: null,
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
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        files: { orderBy: { position: "asc" }, include: { asset: true } },
      },
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        materialDescription: r.materialDescription,
        type: r.type,
        isDefault: r.isDefault,
        files: await Promise.all(
          r.files.map(async (f) => ({
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
      const { template, trackingTag } = await this.context(tx, req, id);
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
          templateId: null,
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
            !m.files.length,
        )
      )
        throw new BadRequestException("请选择有效的人物和产品素材");
      const workflow = selected
        ? applyWorkflowSlots(selected, materials)
        : null;
      const available = this.engine.availability(template.config);
      const publishTags = [
        ...dto.tagIds.map((id) => tags.find((t) => t.id === id)!.name),
        trackingTag.name,
      ];
      const draft = await tx.videoCreationDraft.create({
        data: {
          organizationId: req.user.organizationId,
          creatorId: req.user.id,
          templateId: id,
          revision: template.revision,
          title,
          contentTagIds: dto.tagIds,
          publishTags,
          trackingTagId: trackingTag.id,
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
            files: m.files.map((f) => ({
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
              ...m.files.map((f) => f.asset.id),
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
