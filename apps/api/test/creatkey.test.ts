import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteTemplateConfig } from "../src/creatkey-config.js";
import { validateWorkflowConfig } from "../src/workflow-definition.js";
import {
  selectedWorkflowMaterials,
  applyWorkflowSlots,
} from "../src/workflow-slots.js";
import { CreatKeyClient } from "../src/creatkey-client.js";
import { WorkflowEngine } from "../src/workflow-engine.js";
const source: any = {
  id: "approved",
  sourceHash: "a".repeat(64),
  compatible: true,
  slots: [
    { id: "p", label: "产品", preview: "https://source.example/p.png" },
    { id: "human", label: "人物" },
  ],
};
test("远程模板保留摘要与图片预览，素材类型在 IMP 配置，忽略远程执行图", () => {
  const config = remoteTemplateConfig(source, {
    p: "product",
    human: "person",
  });
  assert.equal(validateWorkflowConfig(config).sourceTemplateId, "approved");
  assert.equal(
    config.definition.nodes[0].data.config.media.url,
    source.slots[0].preview,
  );
  assert.throws(() => remoteTemplateConfig(source, { p: "product" }));
  assert.throws(() =>
    remoteTemplateConfig({ ...source, compatible: false }, {}),
  );
  const selection = selectedWorkflowMaterials(config, {
    p: { materialId: "prod" },
    human: { materialId: "person" },
  })!;
  const graph = applyWorkflowSlots(selection, [
    {
      id: "prod",
      type: "product",
      productViewAsset: { id: "pfile", mimeType: "image/webp" },
      files: [{ asset: { id: "pfile", mimeType: "image/webp" } }],
    },
    {
      id: "person",
      type: "person",
      personViewAsset: { id: "hfile", mimeType: "image/webp" },
      files: [{ asset: { id: "hfile", mimeType: "image/webp" } }],
    },
  ]);
  assert.equal(graph.nodes[0].data.config.media.assetId, "pfile");
  assert.equal(graph.nodes[1].data.config.media.assetId, "hfile");
  assert.equal(
    config.definition.nodes[0].data.config.media.url,
    source.slots[0].preview,
  );
});
test("远程调用先持久化上传映射，重试使用相同幂等 ID，成功后只查询结果", async () => {
  const updates: any[] = [],
    submits: any[] = [],
    uploads: any[] = [];
  const row: any = {
    id: "draft-1",
    organizationId: "org",
    templateSnapshot: {
      config: remoteTemplateConfig(source, { p: "product", human: "person" }),
    },
    remoteAssets: {},
    workflowSnapshot: {
      nodes: [
        { id: "p", data: { config: { media: { assetId: "a" } } } },
        { id: "human", data: { config: { media: { assetId: "b" } } } },
      ],
    },
  };
  const db: any = {
    asset: { findFirst: async ({ where }: any) => ({ id: where.id }) },
    videoCreationDraft: {
      update: async ({ data }: any) => {
        updates.push(data);
        Object.assign(row, data);
      },
    },
  };
  const client: any = {
    upload: async (_: any, a: any) => {
      uploads.push(a.id);
      return { id: "remote-" + a.id };
    },
    request: async (...args: any[]) => {
      submits.push(args);
      return { id: "job" };
    },
    job: async () => ({ status: "running", outputs: [] }),
  };
  const engine = new WorkflowEngine(db, {} as any, {} as any, client);
  await (engine as any).advanceRemote(row);
  await (engine as any).advanceRemote(row);
  assert.deepEqual(uploads, ["a", "b"]);
  assert.equal(submits.length, 1);
  assert.equal(submits[0][3], row.id);
  assert.deepEqual(submits[0][2].slotValues, {
    p: { id: "remote-a" },
    human: { id: "remote-b" },
  });
  assert.equal(updates[0].remoteAssets.p, "remote-a");
});
test("媒体下载拒绝白名单外域名，不发起网络请求", async () => {
  const old = { ...process.env };
  process.env.CREATKEY_API_URL = "https://api.example/api/openapi/v1";
  process.env.CREATKEY_API_KEY = "test";
  process.env.CREATKEY_MEDIA_HOSTS = "media.example";
  try {
    const client = new CreatKeyClient({} as any);
    await assert.rejects(
      () => client.download("https://untrusted.example/x.png", "image"),
      /允许/,
    );
    await assert.rejects(
      () => client.download("http://media.example/x.png", "image"),
      /允许/,
    );
  } finally {
    for (const k of [
      "CREATKEY_API_URL",
      "CREATKEY_API_KEY",
      "CREATKEY_MEDIA_HOSTS",
    ]) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});

test("上游授权异常可恢复，并返回明确的 503 提示", async (t) => {
  const old = { ...process.env };
  process.env.CREATKEY_API_URL = "https://api.example/api/openapi/v1";
  process.env.CREATKEY_API_KEY = "test";
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ message: "unauthorized" }), {
        status: 401,
      }),
  );
  try {
    const client = new CreatKeyClient({} as any);
    await assert.rejects(
      () => client.job("org", "job"),
      (e: any) =>
        e.retryable === true &&
        e.getStatus() === 503 &&
        e.message.includes("密钥"),
    );
  } finally {
    for (const key of ["CREATKEY_API_URL", "CREATKEY_API_KEY"]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});

test("生成图支持20MB归档，封面仍保持3MB限制", async (t) => {
  const oldUrl = process.env.CREATKEY_API_URL,
    oldKey = process.env.CREATKEY_API_KEY;
  process.env.CREATKEY_API_URL = "https://api.example/api/openapi/v1";
  process.env.CREATKEY_API_KEY = "test";
  const content = new Uint8Array(4 * 1024 * 1024);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(content, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(content.length),
        },
      }),
  );
  try {
    const client = new CreatKeyClient({} as any);
    await assert.rejects(
      () => client.download("https://api.example/result.png", "image"),
      /大小限制/,
    );
    assert.equal(
      (
        await client.download(
          "https://api.example/result.png",
          "image",
          20 * 1024 * 1024,
        )
      ).size,
      content.length,
    );
    process.env.CREATKEY_API_URL = "invalid-url";
    await assert.rejects(() => client.job("org", "job"), /格式无效/);
  } finally {
    if (oldUrl === undefined) delete process.env.CREATKEY_API_URL;
    else process.env.CREATKEY_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.CREATKEY_API_KEY;
    else process.env.CREATKEY_API_KEY = oldKey;
  }
});
