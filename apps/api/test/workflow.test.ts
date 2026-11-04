import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkflow,
  validateWorkflowConfig,
} from "../src/workflow-definition.js";
import {
  selectedWorkflowMaterials,
  applyWorkflowSlots,
} from "../src/workflow-slots.js";
const config = () => ({
  workflowFormat: "creatkey",
  definition: {
    schemaVersion: 1,
    nodes: [
      {
        id: "product",
        slot: true,
        data: {
          kind: "input.image",
          label: "产品",
          config: { media: { url: "https://old.example/a.png" } },
          run: { output: "不能复用" },
        },
      },
      {
        id: "person",
        slot: true,
        data: { kind: "input.image", label: "人物", config: {} },
      },
      {
        id: "script",
        slot: true,
        data: { kind: "input.text", label: "脚本", config: { text: "原脚本" } },
      },
      {
        id: "video",
        data: {
          kind: "ai.image-to-video",
          label: "视频",
          config: { model: "model", duration: 4 },
        },
      },
    ],
    edges: [
      {
        id: "a",
        source: "product",
        sourceHandle: "image",
        target: "video",
        targetHandle: "image",
      },
      {
        id: "b",
        source: "script",
        sourceHandle: "text",
        target: "video",
        targetHandle: "prompt",
      },
    ],
  },
  slots: [
    { nodeId: "product", materialType: "product" },
    { nodeId: "person", materialType: "person" },
    { nodeId: "script", materialType: "text" },
  ],
});
test("CreatKey 导入剔除运行结果，全部槽位必须有效绑定", () => {
  const raw = config(),
    parsed = validateWorkflowConfig(raw);
  assert.equal((parsed.definition.nodes[0].data as any).run, undefined);
  assert.equal(parsed.slots.length, 2);
  assert.equal(parsed.definition.nodes[2].slot, false);
  assert.equal(parsed.definition.nodes[2].data.config.text, "原脚本");
  assert.throws(
    () => validateWorkflowConfig({ ...raw, slots: raw.slots.slice(1) }),
    /全部图片槽位/,
  );
  assert.throws(
    () =>
      validateWorkflowConfig({
        ...raw,
        slots: raw.slots.map((s) => ({ ...s, materialType: "text" })),
      }),
    /图片槽位/,
  );
  const broken = structuredClone(raw.definition);
  broken.edges[0].source = "missing";
  assert.throws(() => normalizeWorkflow(broken), /无效连线/);
});
test("按节点替换图片且固定原始文本，不污染模板；阻止素材类型或文件越权", () => {
  const raw = config();
  const selection = selectedWorkflowMaterials(raw, {
    product: { materialId: "p", assetId: "p2" },
    person: { materialId: "h" },
  })!;
  const materials = [
    {
      id: "p",
      type: "product",
      files: [
        { asset: { id: "p1", mimeType: "image/png" } },
        { asset: { id: "p2", mimeType: "image/png" } },
      ],
    },
    {
      id: "h",
      type: "person",
      files: [{ asset: { id: "h1", mimeType: "image/png" } }],
    },
  ];
  const applied = applyWorkflowSlots(selection, materials);
  assert.equal(applied.nodes[0].data.config.media.assetId, "p2");
  assert.equal(applied.nodes[2].data.config.text, "原脚本");
  assert.throws(
    () =>
      selectedWorkflowMaterials(raw, {
        ...selection.values,
        script: { text: "篡改脚本" },
      }),
    /槽位与当前模板/,
  );
  assert.equal(
    (raw.definition.nodes[0].data.config as any).media.url,
    "https://old.example/a.png",
  );
  assert.throws(
    () => applyWorkflowSlots(selection, materials.slice(1)),
    /类型不匹配/,
  );
  selection.values.product.assetId = "foreign";
  assert.throws(() => applyWorkflowSlots(selection, materials), /有效图片/);
  assert.throws(() => selectedWorkflowMaterials(raw, {}), /槽位与当前模板/);
});

test("旧文本槽位绑定被忽略，即使原先绑定产品描述也不替换脚本", () => {
  const raw = config();
  raw.slots[2].materialType = "product";
  const selection = selectedWorkflowMaterials(raw, {
    product: { materialId: "p" },
    person: { materialId: "h" },
  })!;
  assert.equal(selection.config.slots.length, 2);
  assert.equal(selection.config.definition.nodes[2].data.config.text, "原脚本");
  const fixed = config();
  fixed.definition.nodes[0].slot = false;
  fixed.definition.nodes[1].slot = false;
  fixed.slots = [fixed.slots[2]];
  const parsed = validateWorkflowConfig(fixed);
  assert.deepEqual(parsed.slots, []);
  assert.equal(parsed.definition.nodes[2].data.config.text, "原脚本");
});
