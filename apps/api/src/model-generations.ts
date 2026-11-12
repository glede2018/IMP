import {
  productViewPayload,
  isMaterialView,
  viewJobField,
  viewAssetField,
} from "./product-views.js";
import { stableSlotValues } from "./workflow-slots.js";
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  Req,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { IsString, IsUUID, IsObject, Length } from "class-validator";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { SessionGuard, requireRole, type AuthRequest } from "./auth.js";
import { CreatKeyClient, CreatKeyConnectionError } from "./creatkey-client.js";
import type { Prisma } from "@prisma/client";
const json = (v: any) => v as Prisma.InputJsonValue;
class ProductViewDto {
  @IsString() @Length(1, 100) materialId!: string;
  @IsString() @Length(1, 100) modelId!: string;
  @IsUUID() requestId!: string;
  @IsObject() parameters!: Record<string, unknown>;
}
class GenerateDto {
  @IsString() @Length(1, 100) materialId!: string;
  @IsString() @Length(1, 100) modelId!: string;
  @IsUUID() requestId!: string;
  @IsObject() inputs!: Record<string, unknown>;
  @IsObject() parameters!: Record<string, unknown>;
}
@Injectable()
export class ModelGenerations implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    private db: Database,
    private client: CreatKeyClient,
    private storage: Storage,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () => void this.tick().catch(() => undefined),
      5000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async createProductViews(
    dto: ProductViewDto,
    req: AuthRequest,
    type = "product",
  ) {
    requireRole(req);
    const material = await this.db.material.findFirst({
      where: {
        id: dto.materialId,
        organizationId: req.user.organizationId,
        type,
        deletedAt: null,
      },
      include: { files: { orderBy: { position: "asc" } } },
    });
    if (!material) throw new NotFoundException("素材不存在");
    const models = await this.client.request<any[]>(
      "/models",
      req.user.organizationId,
    );
    const model = models.find((m) => m.id === dto.modelId);
    if (!model) throw new BadRequestException("模型不存在或不可用");
    const payload = productViewPayload(
      model,
      material.files.map((f) => f.assetId),
      dto.parameters,
      type,
    );
    return this.create(
      { ...dto, ...payload },
      req,
      type === "person" ? "person_views" : "product_views",
    );
  }
  async create(dto: GenerateDto, req: AuthRequest, purpose = "general") {
    requireRole(req);
    const payload = { inputs: dto.inputs, parameters: dto.parameters };
    const old = await this.db.modelGeneration.findUnique({
      where: {
        organizationId_requestId: {
          organizationId: req.user.organizationId,
          requestId: dto.requestId,
        },
      },
    });
    if (old) {
      if (
        old.purpose !== purpose ||
        old.materialId !== dto.materialId ||
        old.modelId !== dto.modelId ||
        stableSlotValues(old.payload) !== stableSlotValues(payload)
      )
        throw new ConflictException("幂等请求参数不一致");
      return old;
    }
    const material = await this.db.material.findFirst({
      where: {
        id: dto.materialId,
        organizationId: req.user.organizationId,
        deletedAt: null,
      },
      include: { files: { include: { asset: true } } },
    });
    if (!material) throw new NotFoundException("素材不存在");
    const models = await this.client.request<any[]>(
        "/models",
        req.user.organizationId,
      ),
      model = models.find((m) => m.id === dto.modelId);
    if (!model || !model.outputs?.some((p: any) => p.type === "image"))
      throw new BadRequestException("请选择可生成图片的模型");
    if (Buffer.byteLength(JSON.stringify(dto)) > 100000)
      throw new BadRequestException("模型输入过大");
    if (
      Object.keys(dto.inputs).some(
        (k) => !model.inputs.some((p: any) => p.id === k),
      )
    )
      throw new BadRequestException("模型输入无效");
    for (const port of model.inputs) {
      const value = dto.inputs[port.id];
      if (
        value == null ||
        value === "" ||
        (Array.isArray(value) && !value.length)
      ) {
        if (port.required) throw new BadRequestException(`请填写${port.label}`);
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      if (values.length > 10 || (!port.multiple && values.length > 1))
        throw new BadRequestException("模型输入数量无效");
      for (const v of values) {
        if (port.type === "text") {
          if (typeof v !== "string" || v.length > 20000)
            throw new BadRequestException("提示词无效");
        } else if (
          !material.files.some(
            (f) =>
              f.asset.id === (v as any)?.id &&
              f.asset.mimeType.startsWith(port.type + "/"),
          )
        )
          throw new BadRequestException("参考文件必须来自当前素材");
      }
    }
    const created = await this.db.$transaction(async (tx) => {
      if (isMaterialView(purpose)) {
        await tx.$queryRaw`SELECT id FROM "Material" WHERE id=${material.id} FOR UPDATE`;
        const current = await tx.material.findFirst({
          where: { id: material.id, deletedAt: null },
          include: { files: true },
        });
        if (
          !current ||
          current.type !==
            (purpose === "person_views" ? "person" : "product") ||
          JSON.stringify(current.files.map((f) => f.assetId).sort()) !==
            JSON.stringify(material.files.map((f) => f.assetId).sort())
        )
          throw new ConflictException("参考图已变更，请刷新后重试");
        if (current[viewJobField(purpose)]) {
          const running = await tx.modelGeneration.findFirst({
            where: {
              id: current[viewJobField(purpose)]!,
              status: { in: ["queued", "running"] },
            },
          });
          if (running && running.requestId !== dto.requestId)
            throw new ConflictException("三视图正在生成，请勿重复提交");
        }
      }
      // 持有素材锁后再次检查幂等记录，避免并发重试清空已完成的视图。
      const saved = await tx.modelGeneration.findUnique({
        where: {
          organizationId_requestId: {
            organizationId: req.user.organizationId,
            requestId: dto.requestId,
          },
        },
      });
      if (saved) {
        if (
          saved.purpose !== purpose ||
          saved.materialId !== dto.materialId ||
          saved.modelId !== dto.modelId ||
          stableSlotValues(saved.payload) !== stableSlotValues(payload)
        )
          throw new ConflictException("幂等请求参数不一致");
        return saved;
      }
      const created = await tx.modelGeneration.upsert({
        where: {
          organizationId_requestId: {
            organizationId: req.user.organizationId,
            requestId: dto.requestId,
          },
        },
        update: {},
        create: {
          purpose,
          organizationId: req.user.organizationId,
          creatorId: req.user.id,
          materialId: material.id,
          modelId: dto.modelId,
          requestId: dto.requestId,
          payload: json(payload),
        },
      });
      if (
        created.purpose !== purpose ||
        created.materialId !== dto.materialId ||
        created.modelId !== dto.modelId ||
        stableSlotValues(created.payload) !== stableSlotValues(payload)
      )
        throw new ConflictException("幂等请求参数不一致");
      if (isMaterialView(purpose))
        await tx.material.update({
          where: { id: material.id },
          data: {
            [viewJobField(purpose)]: created.id,
            [viewAssetField(purpose)]: null,
            generationStatus: "generating",
          },
        });
      return created;
    });
    if (
      created.purpose !== purpose ||
      created.materialId !== dto.materialId ||
      created.modelId !== dto.modelId ||
      stableSlotValues(created.payload) !== stableSlotValues(payload)
    )
      throw new ConflictException("幂等请求参数不一致");
    return created;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const row = await this.db.modelGeneration.findFirst({
        where: {
          status: { in: ["queued", "running"] },
          nextPollAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        orderBy: { nextPollAt: "asc" },
      });
      if (!row) return;
      const claim = await this.db.modelGeneration.updateMany({
        where: {
          id: row.id,
          status: row.status,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { status: "running", leaseUntil: new Date(Date.now() + 300000) },
      });
      if (!claim.count) return;
      try {
        await this.advance(row);
      } catch (e) {
        if (e instanceof CreatKeyConnectionError)
          await this.db.modelGeneration.update({
            where: { id: row.id },
            data: { error: e.message },
          });
        else
          await this.db.modelGeneration.update({
            where: { id: row.id },
            data: {
              status: "failed",
              error: (e as Error).message.slice(0, 500),
              finishedAt: new Date(),
            },
          });
        if (
          !(e instanceof CreatKeyConnectionError) &&
          isMaterialView(row.purpose)
        )
          await this.db.material.updateMany({
            where: {
              id: row.materialId,
              [viewJobField(row.purpose)]: row.id,
              deletedAt: null,
            },
            data: { generationStatus: "failed" },
          });
      } finally {
        await this.db.modelGeneration.update({
          where: { id: row.id },
          data: { leaseUntil: null, nextPollAt: new Date(Date.now() + 5000) },
        });
      }
    } finally {
      this.busy = false;
    }
  }
  private async advance(row: any) {
    if (isMaterialView(row.purpose)) {
      const current = await this.db.material.findFirst({
        where: {
          id: row.materialId,
          organizationId: row.organizationId,
          deletedAt: null,
          [viewJobField(row.purpose)]: row.id,
        },
      });
      if (!current)
        throw new Error("参考图已变更或素材已删除，请重新生成三视图");
    }
    const inputs = structuredClone(row.payload.inputs),
      refs = { ...row.referenceAssets };
    if (!row.remoteJobId) {
      for (const [port, value] of Object.entries(inputs)) {
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          if (!v || typeof v !== "object") continue;
          const id = (v as any).id;
          if (!refs[id]) {
            const asset = await this.db.asset.findFirst({
              where: { id, organizationId: row.organizationId },
            });
            if (!asset) throw new Error("参考图片不存在");
            refs[id] = (await this.client.upload(row.organizationId, asset)).id;
            await this.db.modelGeneration.update({
              where: { id: row.id },
              data: {
                referenceAssets: json(refs),
                leaseUntil: new Date(Date.now() + 300000),
              },
            });
          }
          (v as any).id = refs[id];
        }
        inputs[port] = Array.isArray(value) ? values : values[0];
      }
      const job = await this.client.request<any>(
        "/model-jobs",
        row.organizationId,
        { modelId: row.modelId, inputs, parameters: row.payload.parameters },
        row.id,
      );
      row.remoteJobId = job.id;
      await this.db.modelGeneration.update({
        where: { id: row.id },
        data: { remoteJobId: job.id },
      });
    }
    const job = await this.client.job(row.organizationId, row.remoteJobId);
    if (["failed", "cancelled"].includes(job.status))
      throw new Error(job.error || "模型生成失败");
    if (job.status !== "succeeded") {
      await this.db.modelGeneration.update({
        where: { id: row.id },
        data: { error: null },
      });
      return;
    }
    const material = await this.db.material.findFirst({
      where: {
        id: row.materialId,
        organizationId: row.organizationId,
        deletedAt: null,
      },
    });
    if (!material) throw new Error("素材已删除，生成结果未写入素材库");
    const images = job.outputs.filter((a) => a.type === "image");
    if (!images.length || images.length > 9)
      throw new Error("模型未返回有效图片，最多支持 9 张结果");
    if (isMaterialView(row.purpose) && images.length !== 1)
      throw new Error("三视图应返回一张完整视图图，请将模型输出数量设为 1");
    const uploaded: any[] = [];
    try {
      for (const image of images) {
        await this.db.modelGeneration.update({
          where: { id: row.id },
          data: { leaseUntil: new Date(Date.now() + 300000) },
        });
        const file = await this.client.download(
          image.url,
          "image",
          20 * 1024 * 1024,
        );
        uploaded.push({
          ...(await this.storage.upload(
            file,
            row.organizationId,
            "image",
            material.type === "person" ? "person" : "product",
          )),
          name: `${material.name}生成图片`,
        });
      }
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Material" WHERE id=${material.id} AND "deletedAt" IS NULL FOR UPDATE`;
        const active = await tx.material.findFirst({
          where: { id: material.id, deletedAt: null },
        });
        if (!active) throw new Error("素材已删除");
        if (
          isMaterialView(row.purpose) &&
          active[viewJobField(row.purpose)] !== row.id
        )
          throw new Error("参考图已变更，旧任务结果未覆盖当前产品视图");
        const count = await tx.materialFile.count({
          where: { materialId: material.id },
        });
        if (!isMaterialView(row.purpose) && count + uploaded.length > 10)
          throw new BadRequestException(
            "素材图片总数不能超过 10 张，请先删除多余图片",
          );
        const result = [];
        for (const [i, file] of uploaded.entries()) {
          const asset = await tx.asset.create({
            data: {
              ...file,
              organizationId: row.organizationId,
              type: "image",
              retained: true,
            },
          });
          if (!isMaterialView(row.purpose))
            await tx.materialFile.create({
              data: {
                materialId: material.id,
                assetId: asset.id,
                position: count + i,
                label: `生成图 ${i + 1}`,
              },
            });
          result.push({ id: asset.id });
        }
        await tx.material.update({
          where: { id: material.id },
          data: isMaterialView(row.purpose)
            ? {
                generationStatus: "ready",
                [viewAssetField(row.purpose)]: result[0].id,
              }
            : { generationStatus: "ready" },
        });
        await tx.modelGeneration.update({
          where: { id: row.id },
          data: {
            status: "completed",
            error: null,
            result: json(result),
            finishedAt: new Date(),
          },
        });
      });
    } catch (e) {
      await Promise.allSettled(
        uploaded.map((f) => this.storage.remove(f.objectKey)),
      );
      throw e;
    }
  }
}
@Controller("model-generations")
@UseGuards(SessionGuard)
export class ModelGenerationsController {
  constructor(
    private db: Database,
    private service: ModelGenerations,
    private client: CreatKeyClient,
    private storage: Storage,
  ) {}
  @Get("models") models(@Req() req: AuthRequest) {
    return this.client.request("/models", req.user.organizationId);
  }
  @Get() async list(
    @Query("materialId") materialId: string,
    @Req() req: AuthRequest,
  ) {
    if (!materialId || materialId.length > 100)
      throw new BadRequestException("素材标识无效");
    return this.db.modelGeneration.findMany({
      where: { materialId, organizationId: req.user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        modelId: true,
        createdAt: true,
        purpose: true,
      },
    });
  }
  @Post("person-views") personViews(
    @Body() dto: ProductViewDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createProductViews(dto, req, "person");
  }
  @Post("product-views") productViews(
    @Body() dto: ProductViewDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createProductViews(dto, req);
  }
  @Post() create(@Body() dto: GenerateDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req);
  }
  @Get(":id") async status(@Param("id") id: string, @Req() req: AuthRequest) {
    const row = await this.db.modelGeneration.findFirst({
      where: { id, organizationId: req.user.organizationId },
    });
    if (!row) throw new NotFoundException("生成任务不存在");
    const ids = (row.result as any[]).map((r) => r.id),
      assets = ids.length
        ? await this.db.asset.findMany({
            where: { id: { in: ids }, organizationId: req.user.organizationId },
          })
        : [];
    return {
      id: row.id,
      status: row.status,
      error: row.error,
      images: await Promise.all(
        assets.map(async (a) => ({
          id: a.id,
          url: (await this.storage.links(a)).preview,
        })),
      ),
    };
  }
}
