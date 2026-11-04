import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { SessionGuard, type AuthRequest } from "./auth.js";
import { hasPermission, permissionsFor } from "./permissions.js";
import {
  isWorkflow,
  type WorkflowDefinition,
  type WorkflowNode,
} from "./workflow-definition.js";

type Output = {
  type: string;
  value?: unknown;
  text?: string;
  assets?: { url: string; type: string }[];
  ports?: Record<string, Output>;
};
type NodeState = {
  status: "submitting" | "pending" | "completed" | "failed";
  taskId?: string;
  output?: Output;
  error?: string;
};
type States = Record<string, NodeState>;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const httpUrl = (v: string) => {
  const u = new URL(v);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new Error("媒体地址无效");
  return u;
};

// 适配层只处理单节点推理。依赖调度、素材替换与任务持久化由 IMP 独立完成。
@Injectable()
export class WorkflowProvider {
  modelMap(): Record<string, string> {
    try {
      return JSON.parse(process.env.WORKFLOW_MODEL_MAP || "{}");
    } catch {
      return {};
    }
  }
  async request(path: string, body?: unknown) {
    const base = process.env.WORKFLOW_PROVIDER_URL?.replace(/\/$/, "");
    if (!base || !process.env.WORKFLOW_PROVIDER_KEY)
      throw new Error("模型服务尚未配置");
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${process.env.WORKFLOW_PROVIDER_KEY}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`模型服务请求失败（${response.status}）`);
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error("模型返回数据过大");
    return JSON.parse(text);
  }
  async submit(node: WorkflowNode, inputs: unknown[], idempotencyKey: string) {
    const { model, ...config } = node.data.config;
    return this.request("/execute", {
      kind: node.data.kind,
      model: this.modelMap()[model] || model,
      config,
      inputs,
      idempotencyKey,
    });
  }
  poll(taskId: string) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`);
  }
}

@Injectable()
export class WorkflowEngine implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    private db: Database,
    private storage: Storage,
    private provider: WorkflowProvider,
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
  availability(config: unknown) {
    if (!isWorkflow(config))
      return { ready: false, reason: "该模板尚未导入可执行工作流" };
    if (
      !process.env.WORKFLOW_PROVIDER_URL ||
      !process.env.WORKFLOW_PROVIDER_KEY
    )
      return { ready: false, reason: "模型服务尚未配置，素材替换配置可先保存" };
    try {
      httpUrl(process.env.WORKFLOW_PROVIDER_URL);
    } catch {
      return { ready: false, reason: "模型服务地址无效" };
    }
    if (!process.env.WORKFLOW_OUTPUT_HOSTS?.trim())
      return { ready: false, reason: "尚未配置生成结果下载域名白名单" };
    const map = this.provider.modelMap();
    if (
      config.definition.nodes.some(
        (n) =>
          n.data.kind.startsWith("ai.") &&
          (!n.data.config.model ||
            (!map[n.data.config.model] &&
              /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(n.data.config.model))),
      )
    )
      return {
        ready: false,
        reason: "请配置 CreatKey 模型 ID 与当前模型服务的映射",
      };
    return { ready: true, reason: null };
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const row = await this.db.videoCreationDraft.findFirst({
        where: {
          status: { in: ["queued", "generating"] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!row) return;
      const claim = await this.db.videoCreationDraft.updateMany({
        where: {
          id: row.id,
          status: row.status,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          leaseUntil: new Date(Date.now() + 300000),
          status: "generating",
          startedAt: row.startedAt || new Date(),
        },
      });
      if (!claim.count) return;
      try {
        await this.advance(row);
      } catch (error) {
        await this.db.videoCreationDraft.update({
          where: { id: row.id },
          data: {
            status: "failed",
            error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "工作流执行失败",
            finishedAt: new Date(),
          },
        });
      } finally {
        await this.db.videoCreationDraft.update({
          where: { id: row.id },
          data: { leaseUntil: null },
        });
      }
    } finally {
      this.busy = false;
    }
  }
  private async advance(row: any) {
    const graph = row.workflowSnapshot as WorkflowDefinition;
    if (!graph?.nodes?.length) throw new Error("任务没有可执行工作流");
    const states = row.nodeStates as States;
    const node = graph.nodes.find(
      (n) =>
        states[n.id]?.status !== "completed" &&
        graph.edges
          .filter((e) => e.target === n.id)
          .every((e) => states[e.source]?.status === "completed"),
    );
    if (!node) {
      await this.complete(row, graph, states);
      return;
    }
    const saved = states[node.id];
    if (saved?.status === "submitting")
      throw new Error(
        "上次模型提交结果未确认，请核对服务端任务后处理，系统不会自动重复扣费提交",
      );
    if (saved?.status === "failed")
      throw new Error(saved.error || "节点执行失败");
    const inputs = graph.edges
      .filter((e) => e.target === node.id)
      .sort(
        (a, b) =>
          (Number(a.targetHandle?.split("_").at(-1)) || 0) -
          (Number(b.targetHandle?.split("_").at(-1)) || 0),
      )
      .map((e) => {
        const output = states[e.source].output!;
        const value = output.ports?.[e.sourceHandle!] || output;
        return {
          sourceNode: e.source,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          value,
        };
      });
    if (node.data.kind.startsWith("input.")) {
      if (node.data.kind === "input.text")
        states[node.id] = {
          status: "completed",
          output: { type: "text", value: String(node.data.config.text || "") },
        };
      else {
        let media = node.data.config.media;
        if (media?.assetId) {
          const asset = await this.db.asset.findFirst({
            where: { id: media.assetId, organizationId: row.organizationId },
          });
          if (!asset) throw new Error("历史输入素材文件不存在");
          const url = (await this.storage.links(asset)).preview;
          if (!url.startsWith("https://"))
            throw new Error(
              "模型输入需要公网可访问的 HTTPS 素材地址，请使用 OSS 素材",
            );
          media = { ...media, url };
        }
        // 未连线的备用输入无需提供文件。
        if (!media?.url && graph.edges.some((e) => e.source === node.id))
          throw new Error(`${node.data.label}缺少输入文件`);
        if (media?.url) httpUrl(media.url);
        states[node.id] = {
          status: "completed",
          output: {
            type: node.data.kind.slice(6),
            assets: media?.url ? [media] : [],
          },
        };
      }
    } else {
      let result: any;
      if (saved?.status === "pending" && saved.taskId)
        result = await this.provider.poll(saved.taskId);
      else {
        // 先记录提交状态；服务中断后不盲目重发可能已扣费的推理请求。
        states[node.id] = { status: "submitting" };
        await this.db.videoCreationDraft.update({
          where: { id: row.id },
          data: { nodeStates: json(states) },
        });
        result = await this.provider.submit(
          node,
          inputs,
          `${row.id}:${node.id}`,
        );
      }
      if (result.status === "failed")
        throw new Error(`${node.data.label}执行失败，请查看模型服务任务记录`);
      if (result.status === "completed") {
        const output = result.output as Output;
        if (
          !output ||
          typeof output.type !== "string" ||
          JSON.stringify(output).length > 512000
        )
          throw new Error("模型输出格式无效");
        const expected = node.data.kind.includes("image-to-image")
          ? "image"
          : node.data.kind.endsWith("video") ||
              node.data.kind === "transform.video-concat"
            ? "video"
            : null;
        if (
          expected &&
          (output.type !== expected ||
            !output.assets?.length ||
            output.assets.some((a) => {
              try {
                httpUrl(a.url);
                return false;
              } catch {
                return true;
              }
            }))
        )
          throw new Error("模型没有返回有效媒体结果");
        if (
          node.data.kind === "ai.text-variants" &&
          graph.edges
            .filter((e) => e.source === node.id)
            .some((e) => !output.ports?.[e.sourceHandle!])
        )
          throw new Error("模型未返回完整的文本分支端口");
        if (node.data.kind === "ai.storyboard" && !output.ports?.videoPrompt)
          throw new Error("分镜结果缺少 videoPrompt 输出端口");
        states[node.id] = { status: "completed", output };
      } else if (
        ["queued", "pending", "running"].includes(result.status) &&
        typeof result.taskId === "string" &&
        result.taskId.length <= 200
      )
        states[node.id] = { status: "pending", taskId: result.taskId };
      else throw new Error("模型服务任务响应格式无效");
    }
    await this.db.videoCreationDraft.update({
      where: { id: row.id },
      data: { nodeStates: json(states), error: null },
    });
  }
  private async complete(row: any, graph: WorkflowDefinition, states: States) {
    const final = graph.nodes.filter(
      (n) =>
        !graph.edges.some((e) => e.source === n.id) &&
        states[n.id]?.output?.type === "video",
    );
    if (final.length !== 1) throw new Error("工作流必须有唯一最终视频输出");
    const url = httpUrl(states[final[0].id].output!.assets?.[0]?.url || "");
    const hosts = (process.env.WORKFLOW_OUTPUT_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      !hosts.includes(url.hostname.toLowerCase())
    )
      throw new Error("生成结果域名未在下载白名单中");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 50 * 1024 * 1024 ||
      !response.body
    )
      throw new Error("生成结果下载失败或超过 50 MB");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as any) {
      size += chunk.length;
      if (size > 50 * 1024 * 1024) {
        throw new Error("生成视频超过 50 MB");
      }
      chunks.push(chunk);
    }
    const file = {
      buffer: Buffer.concat(chunks),
      size,
      mimetype: "video/mp4",
      originalname: `${row.title}.mp4`,
    } as Express.Multer.File;
    const uploaded = await this.storage.upload(
      file,
      row.organizationId,
      "video",
    );
    try {
      await this.db.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            ...uploaded,
            organizationId: row.organizationId,
            type: "video",
            name: file.originalname,
            retained: true,
          },
        });
        await tx.work.create({
          data: {
            organizationId: row.organizationId,
            title: row.title,
            assetId: asset.id,
            creationId: row.id,
            templateId: row.templateId,
            templateSnapshot: row.templateSnapshot,
            materialSnapshot: row.materialSnapshot,
            caption: row.title,
            publishTags: row.publishTags,
            generationSeconds: Math.max(
              0,
              Math.round(
                (Date.now() - new Date(row.startedAt).getTime()) / 1000,
              ),
            ),
          },
        });
        await tx.videoCreationDraft.update({
          where: { id: row.id },
          data: { status: "completed", finishedAt: new Date(), error: null },
        });
      });
    } catch (error) {
      await this.storage.remove(uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  }
}

@Controller("templates/creations")
@UseGuards(SessionGuard)
export class WorkflowRunsController {
  constructor(
    private db: Database,
    private engine: WorkflowEngine,
  ) {}
  private async find(id: string, req: AuthRequest) {
    if (!hasPermission(permissionsFor(req.user), "works:write"))
      throw new ForbiddenException("没有生成视频权限");
    const row = await this.db.videoCreationDraft.findFirst({
      where: { id, organizationId: req.user.organizationId },
    });
    if (!row) throw new NotFoundException("生成任务不存在");
    return row;
  }
  @Get(":id") async status(@Param("id") id: string, @Req() req: AuthRequest) {
    const row = await this.find(id, req);
    const states = row.nodeStates as States;
    return {
      id: row.id,
      status: row.status,
      error: row.error,
      nodes:
        (row.workflowSnapshot as any)?.nodes.map((n: WorkflowNode) => ({
          id: n.id,
          label: n.data.label,
          status: states[n.id]?.status || "queued",
        })) || [],
    };
  }
  @Post(":id/start") async start(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const row = await this.find(id, req);
    if (!row.workflowSnapshot)
      throw new BadRequestException("此任务没有可执行工作流");
    const available = this.engine.availability(
      (row.templateSnapshot as any).config,
    );
    if (!available.ready) throw new BadRequestException(available.reason!);
    // 只允许尚未提交过模型服务的配置开始执行，避免重试产生重复计费。
    await this.db.videoCreationDraft.updateMany({
      where: { id, status: "awaiting_provider" },
      data: { status: "queued", error: null },
    });
    return this.status(id, req);
  }
}
