import { ApiCookieAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { accountView, authorizationSelect } from "./douyin.js";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { SessionGuard, AuthRequest, requireRole } from "./auth.js";
import {
  PageDto,
  AccountDto,
  AssetDto,
  TemplateDto,
  WorkDto,
  WorkUpdateDto,
  StoreDto,
  HelpDto,
} from "./dto.js";
import { hasPermission, permissionsFor } from "./permissions.js";
import { allowedTransition } from "./security.js";
const paging = (q: PageDto) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});
const contains = (q?: string) =>
  q ? { contains: q, mode: "insensitive" as const } : undefined;
const assetView = (a: {
  id: string;
  objectKey?: string;
  [key: string]: unknown;
}) => {
  const { objectKey, ...view } = a;
  return {
    ...view,
    preview: `/api/v1/assets/${a.id}/file`,
    downloadUrl: `/api/v1/assets/${a.id}/file?download=1`,
  };
};
const workView = (
  w:
    | Prisma.WorkGetPayload<{
        include: {
          asset: true;
          template: { select: { id: true; title: true } };
        };
      }>
    | Prisma.WorkGetPayload<{ include: { asset: true } }>,
) => ({
  ...w,
  asset: assetView(w.asset),
  fileUrl: `/api/v1/assets/${w.assetId}/file`,
  downloadUrl: `/api/v1/assets/${w.assetId}/file?download=1`,
  size: w.asset.size,
  format: w.asset.mimeType,
});
@Injectable()
export class Operations {
  constructor(private db: Database) {}
  async change<T>(
    req: AuthRequest,
    action: string,
    entityId: string,
    mutation: Prisma.PrismaPromise<T>,
  ): Promise<T> {
    const [result] = await this.db.$transaction([
      mutation,
      this.db.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          actorId: req.user.id,
          action,
          entityId,
        },
      }),
    ]);
    return result;
  }
  async asset(id: string, req: AuthRequest) {
    const a = await this.db.asset.findFirst({
      where: { id, organizationId: req.user.organizationId },
    });
    if (!a) throw new NotFoundException("素材不存在");
    return a;
  }
  async store(id: string | undefined | null, req: AuthRequest) {
    if (
      id &&
      !(await this.db.store.findFirst({
        where: { id, organizationId: req.user.organizationId },
      }))
    )
      throw new BadRequestException("门店不存在");
  }
}
@Controller("accounts")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class AccountsController {
  constructor(
    private db: Database,
    private ops: Operations,
  ) {}
  @Get() async list(@Query() q: PageDto, @Req() req: AuthRequest) {
    const where = {
      organizationId: req.user.organizationId,
      platform: q.platform,
      tier: q.tier,
      ...(q.q
        ? { OR: [{ nickname: contains(q.q) }, { accountId: contains(q.q) }] }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.account.findMany({
        where,
        ...paging(q),
        orderBy: { bindTime: "desc" },
        include: {
          store: true,
          authorization: { select: authorizationSelect },
        },
      }),
      this.db.account.count({ where }),
    ]);
    return {
      items: items.map(accountView),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post() async create(@Body() dto: AccountDto, @Req() req: AuthRequest) {
    requireRole(req);
    await this.ops.store(dto.storeId, req);
    return this.ops.change(
      req,
      "account.create",
      dto.accountId,
      this.db.account.create({
        data: {
          ...dto,
          organizationId: req.user.organizationId,
          status: "warning",
        },
      }),
    );
  }
  @Put(":id") async update(
    @Param("id") id: string,
    @Body() dto: AccountDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.ops.store(dto.storeId, req);
    const original = await this.db.account.findFirst({
      where: { id, organizationId: req.user.organizationId },
      include: { authorization: { select: { mode: true } } },
    });
    if (!original) throw new NotFoundException("账号不存在");
    if (
      original.authorization &&
      (dto.platform !== original.platform ||
        dto.accountId !== original.accountId)
    )
      throw new BadRequestException("已授权账号的身份不能手工修改");
    return this.ops.change(
      req,
      "account.update",
      id,
      this.db.account.update({
        where: { id, organizationId: req.user.organizationId },
        data: { ...dto, storeId: dto.storeId || null },
      }),
    );
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.ops.change(
      req,
      "account.delete",
      id,
      this.db.account.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    return { success: true };
  }
}
@Controller("assets")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class AssetsController {
  constructor(
    private db: Database,
    private ops: Operations,
    private storage: Storage,
  ) {}
  @Get() async list(@Query() q: PageDto, @Req() req: AuthRequest) {
    const where = {
      organizationId: req.user.organizationId,
      type: q.type,
      name: contains(q.q),
    };
    const [items, total] = await this.db.$transaction([
      this.db.asset.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.asset.count({ where }),
    ]);
    return {
      items: items.map(assetView),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "name", "type"],
      properties: {
        file: { type: "string", format: "binary" },
        name: { type: "string" },
        type: {
          type: "string",
          enum: ["product", "copy", "image", "portrait", "voice"],
        },
        tags: { type: "string" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AssetDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    if (!file || !file.size)
      throw new BadRequestException("请选择非空文件，最大 50 MB");
    const tags = (dto.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 20 || tags.some((t) => t.length > 40))
      throw new BadRequestException("最多 20 个标签，每个不超过 40 字");
    const stored = await this.storage.upload(
      file,
      req.user.organizationId,
      dto.type,
    );
    try {
      return assetView(
        await this.ops.change(
          req,
          "asset.upload",
          stored.objectKey,
          this.db.asset.create({
            data: {
              ...stored,
              name: dto.name,
              type: dto.type,
              tags,
              organizationId: req.user.organizationId,
            },
          }),
        ),
      );
    } catch (e) {
      await this.storage.remove(stored.objectKey).catch(() => undefined);
      throw e;
    }
  }
  @Get(":id/file") async file(
    @Param("id") id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const asset = await this.ops.asset(id, req);
    const range = req.get("range");
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range))
      throw new BadRequestException("无效的文件范围");
    const file = await this.storage.read(asset.objectKey, range);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Length", file.ContentLength ?? asset.size);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (file.ContentRange) {
      res.status(206);
      res.setHeader("Content-Range", file.ContentRange);
    }
    if (req.query.download === "1") {
      const extensions: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
        "text/plain": ".txt",
      };
      const extension = extensions[asset.mimeType] || "";
      const hasExtension =
        asset.name.toLowerCase().endsWith(extension) ||
        (asset.mimeType === "image/jpeg" && /\.jpeg$/i.test(asset.name));
      const filename = hasExtension ? asset.name : asset.name + extension;
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    }
    const stream = file.Body as import("node:stream").Readable;
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    const asset = await this.ops.asset(id, req);
    if (asset.retained)
      throw new ConflictException(
        "文件已被素材或历史记录引用，请在素材库删除素材；历史文件会保留",
      );
    await this.ops.change(
      req,
      "asset.delete",
      id,
      this.db.asset.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    await this.storage
      .remove(asset.objectKey)
      .catch(() =>
        new Logger("Storage").error(`Orphaned object: ${asset.objectKey}`),
      );
    return { success: true };
  }
}
@Controller("templates")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class TemplatesController {
  constructor(
    private db: Database,
    private ops: Operations,
  ) {}
  @Get() async list(@Query() q: PageDto, @Req() req: AuthRequest) {
    const where = {
      organizationId: req.user.organizationId,
      category: q.category,
      title: contains(q.q),
    };
    const [items, total] = await this.db.$transaction([
      this.db.template.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.template.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async validate(dto: TemplateDto, req: AuthRequest) {
    if (
      dto.coverAssetId &&
      !(await this.ops.asset(dto.coverAssetId, req)).mimeType.startsWith(
        "image/",
      )
    )
      throw new BadRequestException("封面必须是图片");
    if (JSON.stringify(dto.config).length > 16000)
      throw new BadRequestException("模板配置超过 16 KB");
  }
  @Post() async create(@Body() dto: TemplateDto, @Req() req: AuthRequest) {
    requireRole(req);
    await this.validate(dto, req);
    return this.ops.change(
      req,
      "template.create",
      dto.title,
      this.db.template.create({
        data: {
          ...dto,
          config: dto.config as Prisma.InputJsonObject,
          organizationId: req.user.organizationId,
        },
      }),
    );
  }
  @Put(":id") async update(
    @Param("id") id: string,
    @Body() dto: TemplateDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.validate(dto, req);
    return this.ops.change(
      req,
      "template.update",
      id,
      this.db.template.update({
        where: { id, organizationId: req.user.organizationId },
        data: {
          ...dto,
          coverAssetId: dto.coverAssetId || null,
          config: dto.config as Prisma.InputJsonObject,
        },
      }),
    );
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.ops.change(
      req,
      "template.delete",
      id,
      this.db.template.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    return { success: true };
  }
}
@Controller("works")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class WorksController {
  constructor(
    private db: Database,
    private ops: Operations,
  ) {}
  @Get() async list(@Query() q: PageDto, @Req() req: AuthRequest) {
    const where = {
      organizationId: req.user.organizationId,
      status: q.status as import("@prisma/client").WorkStatus | undefined,
      title: contains(q.q),
    };
    const [items, total] = await this.db.$transaction([
      this.db.work.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
        include: {
          asset: true,
          template: { select: { id: true, title: true } },
        },
      }),
      this.db.work.count({ where }),
    ]);
    return {
      items: items.map(workView),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post() async create(@Body() dto: WorkDto, @Req() req: AuthRequest) {
    requireRole(req);
    const asset = await this.ops.asset(dto.assetId, req);
    if (!asset.mimeType.startsWith("video/"))
      throw new BadRequestException("作品必须关联视频素材");
    if (
      dto.templateId &&
      !(await this.db.template.findFirst({
        where: { id: dto.templateId, organizationId: req.user.organizationId },
      }))
    )
      throw new BadRequestException("模板不存在");
    const { materialIds = [], ...data } = dto;
    return workView(
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId + ":materials"}))`;
        if (
          (await tx.materialFile.count({
            where: {
              assetId: dto.assetId,
              material: {
                organizationId: req.user.organizationId,
                deletedAt: { not: null },
              },
            },
          })) &&
          !(await tx.materialFile.count({
            where: {
              assetId: dto.assetId,
              material: {
                organizationId: req.user.organizationId,
                deletedAt: null,
              },
            },
          }))
        )
          throw new BadRequestException("素材已删除，不能用于新作品");
        const materials = await tx.material.findMany({
          where: {
            organizationId: req.user.organizationId,
            id: { in: materialIds },
            deletedAt: null,
          },
          include: { files: { orderBy: { position: "asc" } } },
        });
        if (materials.length !== new Set(materialIds).size)
          throw new BadRequestException("素材已删除或不存在，请重新选择");
        const work = await tx.work.create({
          data: {
            ...data,
            organizationId: req.user.organizationId,
            materialSnapshot: materials.map((m) => ({
              id: m.id,
              type: m.type,
              name: m.name,
              description: m.description,
              tags: m.tags,
              categoryPath: m.categoryPath,
              priceCents: m.priceCents,
              voiceAssetId: m.voiceAssetId,
              fileIds: m.files.map((f) => f.assetId),
            })),
          },
          include: { asset: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: req.user.organizationId,
            actorId: req.user.id,
            action: "work.create",
            entityId: work.id,
          },
        });
        return work;
      }),
    );
  }

  @Patch(":id") async update(
    @Param("id") id: string,
    @Body() dto: WorkUpdateDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["admin", "operator", "reviewer"]);
    if (!dto.title && !dto.status)
      throw new BadRequestException("请提供作品标题或审核状态");
    const work = await this.db.work.findFirst({
      where: { id, organizationId: req.user.organizationId },
    });
    if (!work) throw new NotFoundException("作品不存在");
    if (dto.title) requireRole(req);
    if (
      dto.status &&
      ![
        hasPermission(permissionsFor(req.user), "*") ? "admin" : "",
        hasPermission(permissionsFor(req.user), "works:review")
          ? "reviewer"
          : "",
        hasPermission(permissionsFor(req.user), "works:write")
          ? "operator"
          : "",
      ].some((role) => allowedTransition(role, work.status, dto.status!))
    )
      throw new ForbiddenException("无权进行该审核状态变更");
    return workView(
      await this.ops.change(
        req,
        "work.update",
        id,
        this.db.work.update({
          where: {
            id,
            organizationId: req.user.organizationId,
            status: work.status,
          },
          data: dto,
          include: { asset: true },
        }),
      ),
    );
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req);
    await this.ops.change(
      req,
      "work.delete",
      id,
      this.db.work.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    return { success: true };
  }
}
@Controller("organization")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class OrganizationController {
  constructor(
    private db: Database,
    private ops: Operations,
  ) {}
  @Get("stores") async stores(@Req() req: AuthRequest) {
    return this.db.store.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }
  @Post("stores") async store(@Body() dto: StoreDto, @Req() req: AuthRequest) {
    requireRole(req, ["admin"]);
    return this.ops.change(
      req,
      "store.create",
      dto.name,
      this.db.store.create({
        data: { ...dto, organizationId: req.user.organizationId },
      }),
    );
  }
  @Put("stores/:id") async rename(
    @Param("id") id: string,
    @Body() dto: StoreDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["admin"]);
    return this.ops.change(
      req,
      "store.update",
      id,
      this.db.store.update({
        where: { id, organizationId: req.user.organizationId },
        data: dto,
      }),
    );
  }
  @Delete("stores/:id") async removeStore(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["admin"]);
    if (
      await this.db.account.count({
        where: { organizationId: req.user.organizationId, storeId: id },
      })
    )
      throw new ConflictException("门店仍有关联账号");
    await this.ops.change(
      req,
      "store.delete",
      id,
      this.db.store.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    return { success: true };
  }
  @Get("audit") async audit(@Query() q: PageDto, @Req() req: AuthRequest) {
    requireRole(req, ["admin"]);
    const where = { organizationId: req.user.organizationId };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
@Controller("help/resources")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class HelpController {
  constructor(
    private db: Database,
    private ops: Operations,
  ) {}
  @Get() async list(@Query() q: PageDto, @Req() req: AuthRequest) {
    const where = {
      organizationId: req.user.organizationId,
      type: q.type,
      title: contains(q.q),
    };
    const [items, total] = await this.db.$transaction([
      this.db.helpResource.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.helpResource.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  validate(dto: HelpDto) {
    if (dto.url && !/^https?:\/\//.test(dto.url))
      throw new BadRequestException("链接必须以 http:// 或 https:// 开头");
  }
  @Post() async create(@Body() dto: HelpDto, @Req() req: AuthRequest) {
    requireRole(req, ["admin"]);
    this.validate(dto);
    return this.ops.change(
      req,
      "help.create",
      dto.title,
      this.db.helpResource.create({
        data: { ...dto, organizationId: req.user.organizationId },
      }),
    );
  }
  @Put(":id") async update(
    @Param("id") id: string,
    @Body() dto: HelpDto,
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["admin"]);
    this.validate(dto);
    return this.ops.change(
      req,
      "help.update",
      id,
      this.db.helpResource.update({
        where: { id, organizationId: req.user.organizationId },
        data: dto,
      }),
    );
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["admin"]);
    await this.ops.change(
      req,
      "help.delete",
      id,
      this.db.helpResource.delete({
        where: { id, organizationId: req.user.organizationId },
      }),
    );
    return { success: true };
  }
}
@Controller("analytics")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class AnalyticsController {
  constructor(private db: Database) {}
  @Get("overview") async overview(@Req() req: AuthRequest) {
    const organizationId = req.user.organizationId;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 6);
    const [
      totalWorks,
      totalAccounts,
      activeAccounts,
      totalAssets,
      totalTemplates,
      reviewWorks,
      recentWorks,
      assets,
      accountGroups,
    ] = await this.db.$transaction([
      this.db.work.count({ where: { organizationId } }),
      this.db.account.count({ where: { organizationId } }),
      this.db.account.count({ where: { organizationId, status: "active" } }),
      this.db.asset.count({ where: { organizationId } }),
      this.db.template.count({ where: { organizationId } }),
      this.db.work.count({ where: { organizationId, status: "review" } }),
      this.db.work.findMany({
        where: { organizationId, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      this.db.asset.aggregate({
        where: { organizationId },
        _sum: { size: true },
      }),
      this.db.account.groupBy({
        by: ["platform"],
        where: { organizationId },
        orderBy: { platform: "asc" },
        _count: true,
      }),
    ]);
    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      return {
        date,
        works: recentWorks.filter(
          (w) => w.createdAt.toISOString().slice(0, 10) === date,
        ).length,
      };
    });
    return {
      totalWorks,
      totalAccounts,
      activeAccounts,
      totalAssets,
      totalTemplates,
      reviewWorks,
      storageBytes: assets._sum.size || 0,
      trend,
      accountDistribution: accountGroups.map((g) => ({
        platform: g.platform,
        count: g._count,
      })),
      todayWorks: trend[6].works,
    };
  }
}
