import { BadRequestException } from "@nestjs/common";
import {
  isWorkflow,
  validateWorkflowConfig,
  type SlotValue,
} from "./workflow-definition.js";

export function selectedWorkflowMaterials(config: unknown, values: unknown) {
  if (!isWorkflow(config)) return null;
  const parsed = validateWorkflowConfig(config);
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new BadRequestException("请填写模板槽位");
  const selected = values as Record<string, SlotValue>;
  if (
    Object.keys(selected).length !== parsed.slots.length ||
    Object.keys(selected).some((k) => !parsed.slots.some((s) => s.nodeId === k))
  )
    throw new BadRequestException("槽位与当前模板不一致");
  for (const slot of parsed.slots) {
    const v = selected[slot.nodeId];
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new BadRequestException(`请填写${slot.label}`);
    if (
      typeof v.materialId !== "string" ||
      !v.materialId ||
      v.materialId.length > 100 ||
      (v.assetId !== undefined &&
        (typeof v.assetId !== "string" || v.assetId.length > 100)) ||
      v.text !== undefined
    )
      throw new BadRequestException(`请选择${slot.label}的素材`);
  }
  return {
    config: parsed,
    values: selected,
    ids: [...new Set(parsed.slots.map((s) => selected[s.nodeId].materialId!))],
  };
}

// 每个槽位按节点 ID 替换；重复使用同一素材不会影响其他槽位和原始模板。
export function applyWorkflowSlots(
  selection: NonNullable<ReturnType<typeof selectedWorkflowMaterials>>,
  materials: any[],
) {
  const graph = structuredClone(selection.config.definition);
  for (const slot of selection.config.slots) {
    const node = graph.nodes.find((n) => n.id === slot.nodeId)!;
    const value = selection.values[slot.nodeId];
    const material = materials.find((m) => m.id === value.materialId);
    if (!material || material.type !== slot.materialType)
      throw new BadRequestException(`${slot.label}的素材类型不匹配或已删除`);
    const file = material.files.find(
      (f: any) =>
        f.asset.mimeType.startsWith("image/") &&
        (!value.assetId || f.asset.id === value.assetId),
    );
    if (!file)
      throw new BadRequestException(`${slot.label}请选择素材中的有效图片`);
    node.data.config = {
      media: { assetId: file.asset.id, type: "image", name: material.name },
    };
  }
  return graph;
}

export function stableSlotValues(value: any): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return JSON.stringify(canonical(value));
}
