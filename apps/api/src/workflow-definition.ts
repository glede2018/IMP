import { BadRequestException } from "@nestjs/common";

export type WorkflowNode = {
  id: string;
  slot?: boolean;
  type?: string;
  position: { x: number; y: number };
  data: {
    kind: string;
    label: string;
    description?: string;
    config: Record<string, any>;
  };
};
export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};
export type WorkflowDefinition = {
  schemaVersion: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
export type WorkflowSlot = {
  nodeId: string;
  label: string;
  materialType: "product" | "person";
  field: "image";
};
export type WorkflowConfig = {
  workflowFormat: "creatkey";
  definition: WorkflowDefinition;
  slots: WorkflowSlot[];
};
export type SlotValue = {
  materialId?: string;
  assetId?: string;
  text?: string;
};
export const isWorkflow = (value: any): value is WorkflowConfig =>
  value?.workflowFormat === "creatkey";
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
const object = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const supported = new Set([
  "input.text",
  "input.image",
  "input.audio",
  "input.video",
  "ai.storyboard",
  "ai.text-variants",
  "ai.prompt-optimize",
  "ai.image-to-image",
  "ai.multi-image-to-image",
  "ai.image-to-video",
  "transform.video-concat",
]);

// 仅导入执行定义；历史运行结果、价格和画布临时状态不会成为新的执行输入。
export function normalizeWorkflow(raw: any): WorkflowDefinition {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.nodes) ||
    !Array.isArray(raw.edges)
  )
    fail("请上传 CreatKey schemaVersion=1 的工作流 JSON");
  if (!raw.nodes.length || raw.nodes.length > 200 || raw.edges.length > 500)
    fail("工作流需包含 1～200 个节点，连线最多 500 条");
  const ids = new Set<string>();
  const nodes: WorkflowNode[] = raw.nodes.map((n: any) => {
    if (
      !object(n) ||
      typeof n.id !== "string" ||
      !n.id ||
      ["__proto__", "constructor", "prototype"].includes(n.id) ||
      n.id.length > 100 ||
      ids.has(n.id)
    )
      fail("节点 ID 无效或重复");
    ids.add(n.id);
    if (
      !object(n.data) ||
      !supported.has(n.data.kind) ||
      !object(n.data.config) ||
      typeof n.data.label !== "string"
    )
      fail(`节点 ${n.id} 类型或配置不受支持`);
    if (n.slot === true && !["input.image", "input.text"].includes(n.data.kind))
      fail("当前仅支持图片和文本输入节点作为素材槽位");
    return {
      id: n.id,
      slot: n.slot === true && n.data.kind === "input.image",
      type: "workflow",
      position: {
        x: Number(n.position?.x) || 0,
        y: Number(n.position?.y) || 0,
      },
      data: {
        kind: n.data.kind,
        label: n.data.label.slice(0, 120),
        config: n.data.config,
        ...(typeof n.data.description === "string"
          ? { description: n.data.description.slice(0, 2000) }
          : {}),
      },
    };
  });
  const edgeIds = new Set<string>();
  const incoming = new Set<string>();
  const edges: WorkflowEdge[] = raw.edges.map((e: any) => {
    if (
      !object(e) ||
      typeof e.id !== "string" ||
      !e.id ||
      edgeIds.has(e.id) ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      e.source === e.target
    )
      fail("工作流存在无效连线");
    edgeIds.add(e.id);
    const source = nodes.find((n) => n.id === e.source)!;
    const target = nodes.find((n) => n.id === e.target)!;
    const sh = e.sourceHandle,
      th = e.targetHandle;
    const outputs =
      source.data.kind === "ai.text-variants"
        ? Array.from(
            { length: Math.min(10, Number(source.data.config.count) || 5) },
            (_, i) => `result_${i + 1}`,
          )
        : source.data.kind === "ai.storyboard"
          ? ["storyboards", "videoPrompt"]
          : [
              source.data.kind.includes("video")
                ? "video"
                : source.data.kind.includes("image")
                  ? "image"
                  : source.data.kind === "input.audio"
                    ? "audio"
                    : "text",
            ];
    if (typeof sh !== "string" || !outputs.includes(sh))
      fail(`节点 ${source.data.label} 输出端口无效`);
    const expected =
      target.data.kind === "transform.video-concat"
        ? /^videos_[0-9]+$/
        : target.data.kind === "ai.image-to-video"
          ? /^(image|prompt)$/
          : target.data.kind.includes("image-to-image")
            ? /^(images|prompt)$/
            : /^(text|prompt)$/;
    if (
      typeof th !== "string" ||
      !expected.test(th) ||
      target.data.kind.startsWith("input.")
    )
      fail(`节点 ${target.data.label} 输入端口无效`);
    const mediaType =
      sh.startsWith("result_") || sh === "videoPrompt" ? "text" : sh;
    const targetType = th.startsWith("videos_")
      ? "video"
      : th === "images"
        ? "image"
        : ["prompt", "text"].includes(th)
          ? "text"
          : th;
    if (mediaType !== targetType) fail("连线两端的数据类型不匹配");
    const key = `${e.target}:${th}`;
    if (incoming.has(key) && th !== "images") fail("同一输入端口不能重复连接");
    incoming.add(key);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,
    };
  });
  const ordered = new Set<string>();
  while (ordered.size < nodes.length) {
    const ready = nodes.filter(
      (n) =>
        !ordered.has(n.id) &&
        edges
          .filter((e) => e.target === n.id)
          .every((e) => ordered.has(e.source)),
    );
    if (!ready.length) fail("工作流包含循环依赖");
    ready.forEach((n) => ordered.add(n.id));
  }
  if (
    !nodes.some(
      (n) =>
        n.data.kind.endsWith("video") ||
        n.data.kind === "transform.video-concat",
    )
  )
    fail("工作流缺少视频输出节点");
  for (const node of nodes) {
    const kind = node.data.kind,
      cfg = node.data.config;
    if (kind.startsWith("ai.")) {
      if (typeof cfg.model !== "string" || !cfg.model.trim())
        fail(`${node.data.label}未指定模型`);
      const textPort = [
        "ai.storyboard",
        "ai.text-variants",
        "ai.prompt-optimize",
      ].includes(kind)
        ? "text"
        : "prompt";
      if (
        !edges.some(
          (e) => e.target === node.id && e.targetHandle === textPort,
        ) &&
        !(typeof cfg[textPort] === "string" && cfg[textPort].trim())
      )
        fail(`${node.data.label}缺少文本输入`);
      if (kind.includes("image-to-")) {
        const imagePort = kind === "ai.image-to-video" ? "image" : "images";
        if (
          !edges.some(
            (e) => e.target === node.id && e.targetHandle === imagePort,
          ) &&
          !cfg.media &&
          !cfg[imagePort]
        )
          fail(`${node.data.label}缺少图片输入`);
      }
    }
    if (kind === "transform.video-concat") {
      const connected = edges
        .filter((e) => e.target === node.id)
        .map((e) => Number(e.targetHandle!.split("_")[1]))
        .sort((a, b) => a - b);
      if (
        !connected.length ||
        connected.some((n, i) => n !== i) ||
        (cfg.videoCount && connected.length !== cfg.videoCount)
      )
        fail("合并视频的镜头数量或顺序无效");
    }
  }
  const finals = nodes.filter(
    (n) =>
      (n.data.kind === "ai.image-to-video" ||
        n.data.kind === "input.video" ||
        n.data.kind === "transform.video-concat") &&
      !edges.some((e) => e.source === n.id),
  );
  if (finals.length !== 1) fail("工作流必须有且仅有一个最终视频输出");
  return { schemaVersion: 1, nodes, edges };
}

export function validateWorkflowConfig(value: any): WorkflowConfig {
  const definition = normalizeWorkflow(value.definition);
  const marked = definition.nodes.filter((n) => n.slot);
  if (!Array.isArray(value.slots)) fail("请配置全部图片槽位的素材类型");
  // 兼容旧模板中的文本槽位绑定：忽略绑定，固定使用 JSON 中的原始文本。
  const textIds = new Set(
    definition.nodes
      .filter((n) => n.data.kind === "input.text")
      .map((n) => n.id),
  );
  const bindings = value.slots.filter((s: any) => !textIds.has(s?.nodeId));
  if (bindings.length !== marked.length) fail("请配置全部图片槽位的素材类型");
  const seen = new Set<string>();
  const slots = bindings.map((s: any): WorkflowSlot => {
    const n = marked.find((n) => n.id === s?.nodeId);
    if (!n) return fail("槽位节点不存在");
    if (seen.has(n.id) || !["product", "person"].includes(s.materialType))
      fail("图片槽位必须绑定产品素材或人物素材，且不能重复");
    seen.add(n.id);
    return {
      nodeId: n.id,
      label: n.data.label,
      materialType: s.materialType,
      field: "image",
    };
  });
  return { workflowFormat: "creatkey", definition, slots };
}

export function validateTemplateConfig(value: Record<string, unknown>) {
  if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024)
    fail("模板配置不能超过 512 KB");
  if (isWorkflow(value)) return validateWorkflowConfig(value);
  if ("nodes" in value || "schemaVersion" in value)
    fail("请通过导入向导完成槽位配置");
  if (JSON.stringify(value).length > 16000) fail("模板配置超过 16 KB");
  return value;
}
