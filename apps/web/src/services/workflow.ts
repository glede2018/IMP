export type WorkflowSlot = {
  nodeId: string;
  label: string;
  materialType: "product" | "person";
  field: "image";
};
export type SlotValue = {
  materialId?: string;
  assetId?: string;
  text?: string;
};
export type WorkflowConfig = {
  workflowFormat: "creatkey";
  definition: {
    schemaVersion: number;
    nodes: {
      id: string;
      slot?: boolean;
      data: { kind: string; label: string; config: Record<string, unknown> };
    }[];
    edges: unknown[];
  };
  slots: WorkflowSlot[];
};
export function workflowConfig(value: unknown): WorkflowConfig | null {
  const config = value as WorkflowConfig;
  if (config?.workflowFormat !== "creatkey") return null;
  return {
    ...config,
    slots: config.slots.filter((slot) =>
      config.definition.nodes.some(
        (node) =>
          node.id === slot.nodeId &&
          node.slot === true &&
          node.data.kind === "input.image",
      ),
    ),
  };
}
export function importSlots(value: unknown) {
  const graph = value as WorkflowConfig["definition"];
  if (
    graph?.schemaVersion !== 1 ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  )
    throw new Error("请上传 CreatKey 导出的工作流 JSON");
  const slots = graph.nodes.filter((n) => n.slot === true);
  if (!slots.length)
    throw new Error("未找到 slot=true 的节点，请在 CreatKey 中标记后重新导出");
  if (slots.some((n) => !["input.image", "input.text"].includes(n.data?.kind)))
    throw new Error("当前只支持图片和文本输入槽位");
  return slots.filter((n) => n.data.kind === "input.image");
}
