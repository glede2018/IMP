import { test } from "node:test";
import assert from "node:assert/strict";
import { importSlots, workflowConfig } from "../src/services/workflow.ts";

test("导入和使用模板时均只显示图片槽位，兼容旧文本绑定", () => {
  const definition = {
    schemaVersion: 1,
    nodes: [
      {
        id: "p",
        slot: true,
        data: { kind: "input.image", label: "产品图", config: {} },
      },
      {
        id: "t",
        slot: true,
        data: {
          kind: "input.text",
          label: "脚本",
          config: { text: "固定原文" },
        },
      },
    ],
    edges: [],
  };
  assert.deepEqual(
    importSlots(definition).map((n) => n.id),
    ["p"],
  );
  const config = workflowConfig({
    workflowFormat: "creatkey",
    definition,
    slots: [
      { nodeId: "p", materialType: "product", field: "image" },
      { nodeId: "t", materialType: "text", field: "text" },
    ],
  })!;
  assert.deepEqual(
    config.slots.map((s) => s.nodeId),
    ["p"],
  );
  assert.equal(config.definition.nodes[1].data.config.text, "固定原文");
  assert.equal(definition.nodes[1].slot, true);
});
