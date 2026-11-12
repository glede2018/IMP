import { BadRequestException } from "@nestjs/common";
import type { RemoteTemplate } from "./creatkey-client.js";
import type { WorkflowConfig } from "./workflow-definition.js";
export function remoteTemplateConfig(
  source: RemoteTemplate,
  types: Record<string, "person" | "product">,
): WorkflowConfig {
  if (!source.compatible)
    throw new BadRequestException(source.reason || "模板暂不支持导入");
  return validateRemoteConfig({
    source: "creatkey-api",
    sourceTemplateId: source.id,
    sourceHash: source.sourceHash,
    workflowFormat: "creatkey",
    definition: {
      schemaVersion: 1,
      edges: [],
      nodes: source.slots.map((s) => ({
        id: s.id,
        slot: true,
        type: "workflow",
        position: { x: 0, y: 0 },
        data: {
          kind: "input.image",
          label: s.label,
          config: { media: s.preview ? { url: s.preview } : null },
        },
      })),
    },
    slots: source.slots.map((s) => ({
      nodeId: s.id,
      label: s.label,
      field: "image",
      materialType: types[s.id],
    })),
  });
}
// 远程模板仅保存素材入口；执行图由 CreatKey 保存并校验摘要。
export function validateRemoteConfig(v: any): WorkflowConfig {
  if (
    typeof v.sourceTemplateId !== "string" ||
    !v.sourceTemplateId ||
    !/^[a-f0-9]{64}$/.test(v.sourceHash || "") ||
    !Array.isArray(v.slots) ||
    !v.slots.length ||
    v.slots.length > 100 ||
    !Array.isArray(v.definition?.nodes)
  )
    throw new BadRequestException("远程模板配置无效");
  const ids = new Set<string>();
  for (const slot of v.slots) {
    const n = v.definition.nodes.find((n: any) => n.id === slot.nodeId);
    if (
      typeof slot.nodeId !== "string" ||
      !slot.nodeId ||
      slot.nodeId.length > 100 ||
      !n ||
      n.data?.kind !== "input.image" ||
      !["product", "person"].includes(slot.materialType) ||
      ids.has(slot.nodeId) ||
      ["__proto__", "constructor", "prototype"].includes(slot.nodeId)
    )
      throw new BadRequestException("请为每个图片槽位选择素材类型");
    ids.add(slot.nodeId);
  }
  return {
    source: "creatkey-api",
    sourceTemplateId: v.sourceTemplateId,
    sourceHash: v.sourceHash,
    workflowFormat: "creatkey",
    definition: {
      schemaVersion: 1,
      edges: [],
      nodes: v.definition.nodes
        .filter((n: any) => ids.has(n.id))
        .map((n: any) => ({
          id: n.id,
          slot: true,
          type: "workflow",
          position: { x: 0, y: 0 },
          data: {
            kind: "input.image",
            label: String(n.data.label).slice(0, 100),
            config: { media: n.data.config?.media || null },
          },
        })),
    },
    slots: v.slots.map((s: any) => ({
      nodeId: s.nodeId,
      label: String(s.label).slice(0, 100),
      materialType: s.materialType,
      field: "image",
    })),
  };
}
