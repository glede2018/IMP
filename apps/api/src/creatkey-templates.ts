import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { IsString, Length, IsObject, IsOptional, IsIn } from "class-validator";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { CreatKeyClient, type RemoteTemplate } from "./creatkey-client.js";
import { SessionGuard, type AuthRequest } from "./auth.js";
import { hasPermission, permissionsFor } from "./permissions.js";
import { remoteTemplateConfig } from "./creatkey-config.js";
class ImportDto {
  @IsString() @Length(1, 100) sourceTemplateId!: string;
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(0, 2000) description!: string;
  @IsIn(["new_product", "festival", "ingredient", "store"]) category!: string;
  @IsObject() slotTypes!: Record<string, "person" | "product">;
  @IsOptional() @IsString() @Length(1, 100) coverAssetId?: string;
}
@Controller("template-catalog")
@UseGuards(SessionGuard)
export class CreatKeyTemplatesController {
  constructor(
    private db: Database,
    private client: CreatKeyClient,
    private storage: Storage,
  ) {}
  @Get() async list(@Query() q: any, @Req() req: AuthRequest) {
    const page = Math.max(1, Math.floor(Number(q.page) || 1)),
      pageSize = 10;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      q: String(q.q || "").slice(0, 120),
    });
    const data = await this.client.request<{
      items: RemoteTemplate[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/templates?${params}`, req.user.organizationId);
    const existing = await this.db.template.findMany({
      where: {
        organizationId: req.user.organizationId,
        sourceTemplateId: { in: data.items.map((i) => i.id) },
      },
      select: { id: true, sourceTemplateId: true },
    });
    return {
      ...data,
      items: data.items.map((i) => ({
        ...i,
        importedId:
          existing.find((t) => t.sourceTemplateId === i.id)?.id || null,
      })),
    };
  }
  @Get(":id") detail(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.client.template(req.user.organizationId, id);
  }
  @Post("import") async import(
    @Body() dto: ImportDto,
    @Req() req: AuthRequest,
  ) {
    if (
      !hasPermission(permissionsFor(req.user), "templates:create") ||
      !hasPermission(permissionsFor(req.user), "templates")
    )
      throw new ForbiddenException("没有导入模板权限");
    const source = await this.client.template(
      req.user.organizationId,
      dto.sourceTemplateId,
    );
    const config = remoteTemplateConfig(source, dto.slotTypes);
    let coverAssetId = dto.coverAssetId,
      uploadedKey: string | undefined;
    if (coverAssetId) {
      if (
        !(await this.db.asset.findFirst({
          where: {
            id: coverAssetId,
            organizationId: req.user.organizationId,
            mimeType: { startsWith: "image/" },
          },
        }))
      )
        throw new BadRequestException("封面文件无效");
    } else if (source.cover?.url) {
      const file = await this.client.download(source.cover.url, "image"),
        stored = await this.storage.upload(
          file,
          req.user.organizationId,
          "image",
          "template",
        );
      uploadedKey = stored.objectKey;
      try {
        coverAssetId = (
          await this.db.asset.create({
            data: {
              ...stored,
              type: "image",
              name: dto.title + "封面",
              organizationId: req.user.organizationId,
            },
          })
        ).id;
      } catch (e) {
        await this.storage.remove(stored.objectKey).catch(() => undefined);
        throw e;
      }
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: {
            organizationId: req.user.organizationId,
            sourceTemplateId: source.id,
            title: dto.title.trim(),
            description: dto.description.trim(),
            category: dto.category,
            config: config as any,
            coverAssetId,
          },
        });
        if (coverAssetId)
          await tx.asset.update({
            where: { id: coverAssetId },
            data: { retained: true },
          });
        await tx.auditLog.create({
          data: {
            organizationId: req.user.organizationId,
            actorId: req.user.id,
            action: "template.import",
            entityId: t.id,
          },
        });
        return t;
      });
    } catch (e) {
      if (uploadedKey && coverAssetId) {
        await this.db.asset
          .delete({ where: { id: coverAssetId } })
          .catch(() => undefined);
        await this.storage.remove(uploadedKey).catch(() => undefined);
      }
      throw e;
    }
  }
}
