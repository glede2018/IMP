import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { fixtureAccess } from "./access-fixture.js";
import { hashPassword } from "../src/security.js";
import { createApp } from "../dist/app.js";
import { CreatKeyClient } from "../dist/creatkey-client.js";
import { WorkflowEngine } from "../dist/workflow-engine.js";
import { ModelGenerations } from "../dist/model-generations.js";
import { Storage } from "../dist/storage.js";
test("CreatKey 模板导入、槽位替换、视频归档与通用图片任务完整接口流程（模拟模型）", async () => {
  const db = new PrismaClient(),
    app = await createApp();
  app.get(WorkflowEngine).onModuleDestroy();
  app.get(ModelGenerations).onModuleDestroy();
  const client = app.get(CreatKeyClient),
    storage = app.get(Storage),
    submissions: any[] = [];
  const template: any = {
    id: "approved-" + randomUUID(),
    title: "审核模板",
    description: "来自 CreatKey",
    cover: null,
    compatible: true,
    sourceHash: "b".repeat(64),
    slots: [{ id: "image", label: "产品图", preview: "https://test/old.png" }],
  };
  const model = {
    id: "model",
    name: "测试图生图",
    capability: "ai.image-to-image",
    inputs: [
      { id: "image", label: "参考图", type: "image", required: true },
      { id: "prompt", label: "提示词", type: "text", required: true },
    ],
    outputs: [{ id: "image", type: "image" }],
    fields: [],
  };
  const viewModel = {
    ...model,
    id: "view-model",
    inputs: [
      {
        id: "images",
        label: "参考图片",
        type: "image",
        required: true,
        multiple: true,
      },
      { id: "prompt", label: "提示词", type: "text", required: true },
    ],
    fields: [{ key: "images", maxItems: 10 }],
  };
  client.ready = () => true;
  client.template = async () => template;
  client.request = async (
    path: string,
    _org: string,
    body?: any,
    key?: string,
  ) => {
    if (path.startsWith("/templates?"))
      return { items: [template], total: 1, page: 1, pageSize: 10 };
    if (path === "/models") return [model, viewModel];
    submissions.push({ path, body, key });
    return { id: path === "/model-jobs" ? "model-job" : "video-job" };
  };
  client.upload = async () => ({ id: "remote-image", type: "image" });
  client.job = async (_org: string, id: string) => ({
    id,
    status: "succeeded",
    progress: 100,
    costKeys: 1,
    outputs: [
      {
        id: "result",
        type: id === "video-job" ? "video" : "image",
        url: "https://test/result",
        mimeType: "image/png",
        name: "结果",
      },
    ],
  });
  client.download = async (_url: string, kind: string) => ({
    buffer: Buffer.from("fake"),
    size: 4,
    mimetype: kind === "image" ? "image/png" : "video/mp4",
    originalname: kind === "image" ? "image.png" : "video.mp4",
  });
  storage.upload = async (file: any) => ({
    objectKey: "test/" + randomUUID(),
    mimeType: file.mimetype,
    size: file.size,
  });
  storage.links = async () => ({
    preview: "https://test/asset",
    download: "https://test/asset",
  });
  storage.remove = async () => undefined;
  await app.listen(0, "127.0.0.1");
  let cookie = "";
  const org = await db.organization.create({ data: { name: "CK集成测试" } }),
    user = await db.user.create({
      data: {
        phone: "152" + String(Date.now()).slice(-8),
        name: "管理员",
        passwordHash: hashPassword("test-password"),
        organizationId: org.id,
        ...fixtureAccess("admin", org.id),
      },
    });
  const call = async (path: string, method = "GET", body?: any) => {
    const response = await fetch((await app.getUrl()) + "/api/v1" + path, {
      method,
      headers: {
        Origin: "http://localhost:8080",
        "X-IMP-Request": "1",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), response };
  };
  try {
    const login = await call("/auth/login", "POST", {
      phone: user.phone,
      password: "test-password",
    });
    assert.equal(login.status, 200);
    cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("/template-catalog")).body.items[0].title,
      template.title,
    );
    // 两个模板页面分别授权，菜单与接口保持一致，撤权立即生效。
    const setPermissions = (permissions: string[]) =>
      db.accessRole.updateMany({
        where: { organizationId: org.id },
        data: { permissions },
      });
    await setPermissions(["templates"]);
    assert.equal((await call("/templates")).status, 200);
    assert.equal((await call("/template-catalog")).status, 403);
    assert.equal((await call(`/template-catalog/${template.id}`)).status, 403);
    await setPermissions(["template-catalog"]);
    assert.equal((await call("/template-catalog")).status, 200);
    assert.equal((await call(`/template-catalog/${template.id}`)).status, 200);
    assert.equal((await call("/templates")).status, 403);
    await setPermissions(["template-catalog", "templates"]);
    assert.equal(
      (
        await call("/template-catalog/import", "POST", {
          sourceTemplateId: template.id,
          title: "无权导入",
          description: "",
          category: "festival",
          slotTypes: { image: "product" },
        })
      ).status,
      403,
    );
    await setPermissions(["template-catalog", "templates", "templates:create"]);
    const imported = await call("/template-catalog/import", "POST", {
      sourceTemplateId: template.id,
      title: "本地标题",
      description: "修改简介",
      category: "festival",
      slotTypes: { image: "product" },
    });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    await setPermissions(["*"]);
    // 已有导入记录也按需获取最终视频，不需要重新导入或修改执行配置。
    template.previewVideo = { type: "video", url: "https://test/preview.mp4" };
    await setPermissions(["templates"]);
    const preview = await call(`/templates/${imported.body.id}/preview`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.url, template.previewVideo.url);
    assert.equal(
      (await call("/templates/not-in-this-tenant/preview")).status,
      404,
    );
    await setPermissions(["template-catalog"]);
    assert.equal(
      (await call(`/templates/${imported.body.id}/preview`)).status,
      403,
    );
    await setPermissions(["*"]);
    delete template.previewVideo;
    assert.deepEqual(
      (await call(`/templates/${imported.body.id}/preview`)).body,
      { url: null },
    );

    assert.equal(imported.body.category, "festival");
    assert.equal(imported.body.config.sourceTemplateId, template.id);
    assert.equal(
      (await call("/template-catalog")).body.items[0].importedId,
      imported.body.id,
    );
    assert.equal(
      (
        await call("/template-catalog/import", "POST", {
          sourceTemplateId: template.id,
          title: "重复",
          description: "",
          category: "store",
          slotTypes: { image: "product" },
        })
      ).status,
      409,
    );
    const asset = await db.asset.create({
      data: {
        organizationId: org.id,
        type: "image",
        name: "参考图片",
        objectKey: "fake/" + randomUUID(),
        mimeType: "image/png",
        size: 4,
      },
    });
    const material = await db.material.create({
      data: {
        organizationId: org.id,
        type: "product",
        name: "商品",
        creatorId: user.id,
        creatorName: user.name,
        files: { create: { assetId: asset.id, position: 0 } },
      },
    });
    // 未生成视图的产品不能被选作模板素材。
    assert.equal(
      (await call("/templates/creation-materials?type=product")).body.length,
      0,
    );
    const asset2 = await db.asset.create({
      data: {
        organizationId: org.id,
        type: "image",
        name: "侧面参考",
        objectKey: "fake/" + randomUUID(),
        mimeType: "image/png",
        size: 4,
      },
    });
    await db.materialFile.create({
      data: { materialId: material.id, assetId: asset2.id, position: 1 },
    });
    const viewPayload = {
      materialId: material.id,
      modelId: viewModel.id,
      requestId: randomUUID(),
      parameters: {},
    };
    const viewJob = await call(
      "/model-generations/product-views",
      "POST",
      viewPayload,
    );
    assert.equal(viewJob.status, 201, JSON.stringify(viewJob.body));
    assert.equal(
      (await call("/model-generations/product-views", "POST", viewPayload)).body
        .id,
      viewJob.body.id,
    );
    assert.equal(
      (
        await call("/model-generations/product-views", "POST", {
          ...viewPayload,
          requestId: randomUUID(),
        })
      ).status,
      409,
    );
    await app.get(ModelGenerations).tick();
    const viewStatus = await call(`/model-generations/${viewJob.body.id}`);
    assert.equal(
      viewStatus.body.status,
      "completed",
      JSON.stringify(viewStatus.body),
    );
    const viewAssetId = viewStatus.body.images[0].id;
    const savedProduct = await db.material.findUniqueOrThrow({
      where: { id: material.id },
    });
    assert.equal(savedProduct.productViewAssetId, viewAssetId);
    assert.equal(
      await db.materialFile.count({ where: { materialId: material.id } }),
      2,
    );
    const picker = await call("/templates/creation-materials?type=product");
    assert.deepEqual(
      picker.body[0].files.map((f: any) => f.id),
      [viewAssetId],
    );
    const viewSubmission = submissions.find((s) => s.path === "/model-jobs");
    assert.equal(viewSubmission.body.inputs.images.length, 2);
    assert.ok(viewSubmission.body.inputs.prompt.includes("正交投影四视图"));
    assert.ok(viewSubmission.body.inputs.prompt.includes("等轴测图"));
    const rawDenied = await call(
      `/templates/${imported.body.id}/creations`,
      "POST",
      {
        title: "拒绝原图",
        revision: 1,
        tagIds: [],
        requestId: randomUUID(),
        slotValues: { image: { materialId: material.id, assetId: asset.id } },
      },
    );
    assert.equal(rawDenied.status, 400);
    const prepared = await call(
      `/templates/${imported.body.id}/prepare`,
      "POST",
    );
    assert.equal(prepared.status, 201);
    assert.equal(prepared.body.execution.ready, true);
    const availabilityPath = `/templates/${imported.body.id}/availability`;
    assert.equal(
      (await call(availabilityPath, "PATCH", { active: "false" })).status,
      400,
    );
    assert.equal(
      (
        await call("/templates/not-in-this-tenant/availability", "PATCH", {
          active: false,
        })
      ).status,
      404,
    );
    assert.equal(
      (await call(availabilityPath, "PATCH", { active: false })).status,
      200,
    );
    assert.equal((await call("/templates")).body.total, 0);
    const unpublished = await call("/templates?marketStatus=inactive");
    assert.equal(unpublished.body.items[0].id, imported.body.id);
    assert.equal(unpublished.body.items[0].active, false);
    assert.equal(
      (await call(`/templates/${imported.body.id}/prepare`, "POST")).status,
      409,
    );
    assert.equal(
      (
        await call(`/templates/${imported.body.id}/creations`, "POST", {
          title: "下架不能创建",
          revision: 1,
          tagIds: [],
          requestId: randomUUID(),
          slotValues: { image: { materialId: material.id, assetId: asset.id } },
        })
      ).status,
      409,
    );
    await db.accessRole.updateMany({
      where: { organizationId: org.id },
      data: { permissions: ["templates", "works", "works:write", "assets"] },
    });
    assert.equal(
      (await call(availabilityPath, "PATCH", { active: true })).status,
      403,
    );
    assert.equal((await call("/templates?marketStatus=inactive")).status, 403);
    assert.equal((await call("/templates")).body.total, 0);
    await db.accessRole.updateMany({
      where: { organizationId: org.id },
      data: { permissions: ["*"] },
    });
    assert.equal(
      (await call(availabilityPath, "PATCH", { active: true })).status,
      200,
    );
    assert.equal((await call("/templates")).body.total, 1);
    const creation = await call(
      `/templates/${imported.body.id}/creations`,
      "POST",
      {
        title: "生成作品",
        revision: 1,
        tagIds: [],
        requestId: randomUUID(),
        slotValues: {
          image: { materialId: material.id, assetId: viewAssetId },
        },
      },
    );
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    await db.videoCreationDraft.update({
      where: { id: creation.body.id },
      data: { nextPollAt: new Date(0) },
    });
    await call(availabilityPath, "PATCH", { active: false });
    await app.get(WorkflowEngine).tick();
    const work = await db.work.findFirst({
      where: { creationId: creation.body.id },
    });
    assert.ok(
      work,
      JSON.stringify(
        await db.videoCreationDraft.findUnique({
          where: { id: creation.body.id },
        }),
      ),
    );
    assert.ok(submissions.some((s) => s.path === "/template-jobs"));
    assert.deepEqual(
      submissions.find((s) => s.path === "/template-jobs").body.slotValues,
      {
        image: { id: "remote-image" },
      },
    );
    const requestId = randomUUID(),
      payload = {
        materialId: material.id,
        modelId: "model",
        requestId,
        inputs: { image: { id: asset.id }, prompt: "生成人物或商品三视图" },
        parameters: {},
      };
    const generation = await call("/model-generations", "POST", payload);
    assert.equal(generation.status, 201, JSON.stringify(generation.body));
    assert.equal(
      (await call("/model-generations", "POST", payload)).body.id,
      generation.body.id,
    );
    await db.modelGeneration.update({
      where: { id: generation.body.id },
      data: { nextPollAt: new Date(0) },
    });
    await app.get(ModelGenerations).tick();
    const result = await call(`/model-generations/${generation.body.id}`);
    assert.equal(result.body.status, "completed", JSON.stringify(result.body));
    assert.equal(result.body.images.length, 1);
    assert.equal(
      await db.materialFile.count({ where: { materialId: material.id } }),
      3,
    );
    assert.equal(
      (await call(`/model-generations?materialId=${material.id}`)).body[0].id,
      generation.body.id,
    );
    assert.equal(submissions.filter((s) => s.path === "/model-jobs").length, 2);
    // 更换参考图后，已生成视图失效，尚未执行的旧任务也不能提交或覆盖。
    const staleJob = await call("/model-generations/product-views", "POST", {
      ...viewPayload,
      requestId: randomUUID(),
    });
    assert.equal(staleJob.status, 201);
    const changed = await call(`/materials/${material.id}`, "PUT", {
      type: "product",
      name: "商品",
      description: "卖点",
      materialDescription: "新参考图",
      categoryPath: ["未分类"],
      priceCents: 0,
      fileIds: [asset2.id],
      tags: [],
      isDefault: false,
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.productView, null);
    assert.equal(changed.body.productViewJobId, null);
    await app.get(ModelGenerations).tick();
    assert.equal(
      (await call(`/model-generations/${staleJob.body.id}`)).body.status,
      "failed",
    );
    assert.equal(submissions.filter((s) => s.path === "/model-jobs").length, 2);
    assert.equal(
      (await db.material.findUniqueOrThrow({ where: { id: material.id } }))
        .productViewAssetId,
      null,
    );
    assert.equal(
      (work.materialSnapshot as any[])[0].files[0].assetId,
      viewAssetId,
    );
    // 上传表单一次保存并入队，模型不可用时不留下半成品，重复请求复用同一任务。
    const inline = {
      type: "product",
      name: "上传时后台生成",
      description: "新品卖点",
      materialDescription: "外观描述",
      categoryPath: ["未分类"],
      priceCents: 100,
      fileIds: [asset.id, asset2.id],
      tags: [],
      isDefault: false,
      productViewModelId: viewModel.id,
      productViewParameters: {},
      productViewRequestId: randomUUID(),
    };
    const beforeCount = await db.material.count({
      where: { organizationId: org.id },
    });
    const invalidModel = await call("/materials", "POST", {
      ...inline,
      productViewModelId: "missing",
      productViewRequestId: randomUUID(),
    });
    assert.equal(invalidModel.status, 400);
    assert.equal(
      await db.material.count({ where: { organizationId: org.id } }),
      beforeCount,
    );
    const automatic = await call("/materials", "POST", inline);
    assert.equal(automatic.status, 201, JSON.stringify(automatic.body));
    assert.equal(automatic.body.generationStatus, "generating");
    assert.equal(
      (await call("/materials", "POST", { ...inline, name: "同标识不同内容" }))
        .status,
      400,
    );
    assert.ok(automatic.body.productViewJobId);
    assert.equal(automatic.body.productView, null);
    assert.equal(
      (await call("/materials", "POST", inline)).body.id,
      automatic.body.id,
    );
    assert.equal(
      await db.material.count({ where: { organizationId: org.id } }),
      beforeCount + 1,
    );
    assert.equal(
      await db.modelGeneration.count({
        where: { materialId: automatic.body.id },
      }),
      1,
    );
    await app.get(ModelGenerations).tick();
    const autoReady = await db.material.findUniqueOrThrow({
      where: { id: automatic.body.id },
    });
    assert.ok(autoReady.productViewAssetId);
    assert.equal(autoReady.generationStatus, "ready");
    assert.equal(
      await db.materialFile.count({ where: { materialId: autoReady.id } }),
      2,
    );
    assert.equal(
      (await call("/materials", "POST", inline)).body.productViewAssetId,
      autoReady.productViewAssetId,
    );
    const edited = await call(`/materials/${autoReady.id}`, "PUT", {
      ...inline,
      fileIds: [asset2.id],
      productViewModelId: model.id,
      productViewRequestId: randomUUID(),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.generationStatus, "generating");
    assert.equal(edited.body.productView, null);
    await app.get(ModelGenerations).tick();
    assert.ok(
      (await db.material.findUniqueOrThrow({ where: { id: autoReady.id } }))
        .productViewAssetId,
    );
    // 人物在本地上传表单内选模型，无需音色，后台生成独立三视图。
    const personInput = {
      type: "person",
      name: "人物三视图",
      description: "烘焙讲解员",
      categoryPath: [],
      tags: [],
      priceCents: 0,
      fileIds: [asset.id, asset2.id],
      isDefault: false,
      viewModelId: viewModel.id,
      viewParameters: {},
      viewRequestId: randomUUID(),
    };
    const person = await call("/materials", "POST", personInput);
    assert.equal(person.status, 201, JSON.stringify(person.body));
    assert.equal(person.body.generationStatus, "generating");
    assert.equal(person.body.voiceAssetId, undefined);
    assert.ok(person.body.personViewJobId);
    assert.equal(
      (await call("/materials", "POST", personInput)).body.id,
      person.body.id,
    );
    await app.get(ModelGenerations).tick();
    const personReady = await db.material.findUniqueOrThrow({
      where: { id: person.body.id },
    });
    assert.ok(personReady.personViewAssetId);
    assert.equal(personReady.productViewAssetId, null);
    assert.equal(
      await db.materialFile.count({ where: { materialId: personReady.id } }),
      2,
    );
    const personSubmission = submissions
      .filter((s) => s.path === "/model-jobs")
      .at(-1)!;
    assert.equal(personSubmission.body.inputs.images.length, 2);
    assert.ok(personSubmission.body.inputs.prompt.includes("角色转面三视图"));
    assert.ok(personSubmission.body.inputs.prompt.includes("脸部不一致"));
    assert.equal(
      personSubmission.body.inputs.prompt.includes("产品设定稿"),
      false,
    );
    const personPicker = await call(
      "/templates/creation-materials?type=person",
    );
    assert.deepEqual(
      personPicker.body[0].files.map((f: any) => f.id),
      [personReady.personViewAssetId],
    );
    const personConfig = structuredClone(imported.body.config);
    personConfig.slots[0].materialType = "person";
    const personTemplate = await db.template.create({
      data: {
        organizationId: org.id,
        title: "人物模板",
        description: "",
        category: "store",
        config: personConfig,
      },
    });
    const personCreation = {
      title: "人物创作",
      revision: 1,
      tagIds: [],
      requestId: randomUUID(),
      slotValues: { image: { materialId: personReady.id, assetId: asset.id } },
    };
    assert.equal(
      (
        await call(
          `/templates/${personTemplate.id}/creations`,
          "POST",
          personCreation,
        )
      ).status,
      400,
    );
    const createdWithViews = await call(
      `/templates/${personTemplate.id}/creations`,
      "POST",
      {
        ...personCreation,
        requestId: randomUUID(),
        slotValues: {
          image: {
            materialId: personReady.id,
            assetId: personReady.personViewAssetId,
          },
        },
      },
    );
    assert.equal(
      createdWithViews.status,
      201,
      JSON.stringify(createdWithViews.body),
    );
    assert.equal(
      createdWithViews.body.materialSnapshot[0].files[0].assetId,
      personReady.personViewAssetId,
    );
    await app.get(WorkflowEngine).tick();
    const changedPerson = await call(`/materials/${personReady.id}`, "PUT", {
      ...personInput,
      fileIds: [asset2.id],
      viewModelId: model.id,
      viewRequestId: randomUUID(),
    });
    assert.equal(changedPerson.status, 200, JSON.stringify(changedPerson.body));
    assert.equal(changedPerson.body.personView, null);
    const originalJob = client.job;
    client.job = async () => ({
      id: "failed",
      status: "failed",
      progress: 0,
      error: "模拟失败",
      costKeys: 0,
      outputs: [],
    });
    await app.get(ModelGenerations).tick();
    assert.equal(
      (await db.material.findUniqueOrThrow({ where: { id: personReady.id } }))
        .generationStatus,
      "failed",
    );
    client.job = originalJob;
    const retryPerson = await call("/model-generations/person-views", "POST", {
      materialId: personReady.id,
      modelId: model.id,
      parameters: {},
      requestId: randomUUID(),
    });
    assert.equal(retryPerson.status, 201, JSON.stringify(retryPerson.body));
    await app.get(ModelGenerations).tick();
    const finalPerson = await db.material.findUniqueOrThrow({
      where: { id: personReady.id },
    });
    assert.equal(finalPerson.generationStatus, "ready");
    assert.ok(finalPerson.personViewAssetId);
  } finally {
    await app.close();
    await db.modelGeneration.deleteMany({ where: { organizationId: org.id } });
    await db.work.deleteMany({ where: { organizationId: org.id } });
    await db.videoCreationDraft.deleteMany({
      where: { organizationId: org.id },
    });
    await db.templateTrackingTag.deleteMany({
      where: { organizationId: org.id },
    });
    await db.template.deleteMany({ where: { organizationId: org.id } });
    await db.material.deleteMany({ where: { organizationId: org.id } });
    await db.materialCategory.deleteMany({ where: { organizationId: org.id } });
    await db.asset.deleteMany({ where: { organizationId: org.id } });
    await db.auditLog.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.accessRole.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  }
});
