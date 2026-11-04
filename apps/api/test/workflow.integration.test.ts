import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
import { WorkflowEngine } from "../dist/workflow-engine.js";
const { createApp } = await import("../dist/app.js");
const graph = () => ({
  schemaVersion: 1,
  nodes: [
    {
      id: "image",
      slot: true,
      data: {
        kind: "input.image",
        label: "产品图",
        config: {},
        run: { output: "x".repeat(110000) },
      },
    },
    {
      id: "text",
      slot: true,
      data: { kind: "input.text", label: "脚本", config: { text: "原脚本" } },
    },
    {
      id: "video",
      data: {
        kind: "ai.image-to-video",
        label: "生成视频",
        config: { model: "test/model", duration: 4 },
      },
    },
  ],
  edges: [
    {
      id: "i",
      source: "image",
      sourceHandle: "image",
      target: "video",
      targetHandle: "image",
    },
    {
      id: "t",
      source: "text",
      sourceHandle: "text",
      target: "video",
      targetHandle: "prompt",
    },
  ],
});

test("导入大于100KB的CreatKey文件，绑定槽位，隔离素材并保存独立快照；任务独立执行归档作品", async (t) => {
  const previousAllowedOrigins = process.env.APP_ALLOWED_ORIGINS;
  process.env.APP_ALLOWED_ORIGINS = "http://localhost:8080";
  const db = new PrismaClient(),
    app = await createApp();
  app.get(WorkflowEngine).onModuleDestroy();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl(),
    org = await db.organization.create({
      data: { name: "workflow-" + randomUUID() },
    });
  const other = await db.organization.create({
    data: { name: "workflow-other-" + randomUUID() },
  });
  const previous = process.env.WORKFLOW_OUTPUT_HOSTS;
  const user = await db.user.create({
    data: {
      phone: "151" + String(Date.now()).slice(-8),
      name: "工作流测试",
      passwordHash: hashPassword("workflow-password"),
      organizationId: org.id,
      ...fixtureAccess("admin", org.id),
    },
  });
  let cookie = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        Origin: "http://localhost:8080",
        "X-IMP-Request": "1",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, data: await response.json() };
  };
  try {
    const login = await call("/auth/login", "POST", {
      phone: user.phone,
      password: "workflow-password",
    });
    cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    const template = await call("/templates", "POST", {
      title: "导入测试",
      description: "slot",
      category: "new_product",
      tags: [],
      config: {
        workflowFormat: "creatkey",
        definition: graph(),
        slots: [
          { nodeId: "image", materialType: "product" },
          { nodeId: "text", materialType: "text" },
        ],
      },
    });
    assert.equal(template.response.status, 201, JSON.stringify(template.data));
    const id = template.data.id;
    assert.equal(template.data.config.definition.nodes[0].data.run, undefined);
    const asset = await db.asset.create({
      data: {
        organizationId: org.id,
        name: "产品图",
        type: "image",
        objectKey: randomUUID(),
        mimeType: "image/png",
        size: 10,
      },
    });
    const material = await db.material.create({
      data: {
        organizationId: org.id,
        creatorId: user.id,
        creatorName: user.name,
        name: "产品",
        type: "product",
        files: { create: { assetId: asset.id, position: 0 } },
      },
    });
    const foreign = await db.material.create({
      data: {
        organizationId: other.id,
        creatorId: user.id,
        creatorName: user.name,
        name: "外部产品",
        type: "product",
      },
    });
    const payload = {
      title: "生成测试",
      revision: 1,
      tagIds: [],
      requestId: randomUUID(),
      slotValues: {
        image: { materialId: material.id, assetId: asset.id },
      },
    };
    const denied = await call(`/templates/${id}/creations`, "POST", {
      ...payload,
      slotValues: { ...payload.slotValues, image: { materialId: foreign.id } },
    });
    assert.equal(denied.response.status, 400);
    const created = await call(`/templates/${id}/creations`, "POST", payload);
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.status, "awaiting_provider");
    const fixedTextDenied = await call(`/templates/${id}/creations`, "POST", {
      ...payload,
      requestId: randomUUID(),
      slotValues: { ...payload.slotValues, text: { text: "不允许修改" } },
    });
    assert.equal(fixedTextDenied.response.status, 400);
    const context = await call(`/templates/${id}/prepare`, "POST", {});
    assert.equal(context.data.template.config.slots.length, 1);

    assert.equal(
      created.data.workflowSnapshot.nodes[0].data.config.media.assetId,
      asset.id,
    );
    assert.equal(
      created.data.workflowSnapshot.nodes[1].data.config.text,
      "原脚本",
    );
    const duplicate = await call(`/templates/${id}/creations`, "POST", payload);
    assert.equal(duplicate.data.id, created.data.id);
    const invalidStart = await call(
      `/templates/creations/${created.data.id}/start`,
      "POST",
      {},
    );
    assert.equal(invalidStart.response.status, 400);
    const stored = await db.template.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      (stored.config as any).definition.nodes[0].data.config,
      {},
    );
    let submissions = 0,
      polls = 0;
    const engine = new WorkflowEngine(
      db as any,
      {
        links: async () => ({ preview: "https://assets.example/product.png" }),
        upload: async (file: any) => {
          assert.equal(file.buffer.toString(), "test-mp4");
          return {
            objectKey: randomUUID(),
            mimeType: "video/mp4",
            size: file.size,
          };
        },
        remove: async () => {},
      } as any,
      {
        submit: async (_node: any, inputs: any[]) => {
          submissions++;
          assert.equal(
            inputs.find((i) => i.targetHandle === "prompt").value.value,
            "原脚本",
          );
          return { status: "pending", taskId: "remote-id" };
        },
        poll: async (taskId: string) => {
          polls++;
          assert.equal(taskId, "remote-id");
          return {
            status: "completed",
            output: {
              type: "video",
              assets: [
                { type: "video", url: "https://outputs.example/result.mp4" },
              ],
            },
          };
        },
      } as any,
    );
    process.env.WORKFLOW_OUTPUT_HOSTS = "outputs.example";
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (url: any, options: any) =>
      String(url) === "https://outputs.example/result.mp4"
        ? new Response("test-mp4", { headers: { "content-type": "video/mp4" } })
        : originalFetch(url, options),
    );
    await db.videoCreationDraft.update({
      where: { id: created.data.id },
      data: { status: "queued" },
    });
    for (let i = 0; i < 5; i++) await engine.tick();
    assert.equal(submissions, 1);
    assert.equal(polls, 1);
    const done = await db.videoCreationDraft.findUniqueOrThrow({
      where: { id: created.data.id },
    });
    assert.equal(done.status, "completed", done.error || "");
    const work = await db.work.findUniqueOrThrow({
      where: { creationId: done.id },
    });
    assert.deepEqual(work.publishTags, done.publishTags);
    assert.equal(work.templateId, id);
    const status = await call(`/templates/creations/${done.id}`);
    assert.equal(status.data.status, "completed");
  } finally {
    if (previousAllowedOrigins === undefined)
      delete process.env.APP_ALLOWED_ORIGINS;
    else process.env.APP_ALLOWED_ORIGINS = previousAllowedOrigins;
    if (previous === undefined) delete process.env.WORKFLOW_OUTPUT_HOSTS;
    else process.env.WORKFLOW_OUTPUT_HOSTS = previous;
    await app.close();
    for (const organizationId of [org.id, other.id]) {
      await db.work.deleteMany({ where: { organizationId } });
      await db.videoCreationDraft.deleteMany({ where: { organizationId } });
      await db.templateTrackingTag.deleteMany({ where: { organizationId } });
      await db.template.deleteMany({ where: { organizationId } });
      await db.material.deleteMany({ where: { organizationId } });
      await db.asset.deleteMany({ where: { organizationId } });
      await db.auditLog.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { organizationId } });
      await db.accessRole.deleteMany({ where: { organizationId } });
      await db.organization.delete({ where: { id: organizationId } });
    }
    await db.$disconnect();
  }
});
