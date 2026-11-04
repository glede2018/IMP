import "../load-env.mjs";
import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
const { Storage } = await import("../dist/storage.js");
test("work library: historical filters, task/complete dedup, caption/hashtags, tenant-safe downloads", async () => {
  const db = new PrismaClient(),
    app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl(),
    storage = new Storage();
  const org = await db.organization.create({
      data: { name: "works-test-" + randomUUID() },
    }),
    foreign = await db.organization.create({
      data: { name: "foreign-" + randomUUID() },
    });
  const password = "works-test-password";
  const admin = await db.user.create({
    data: {
      organizationId: org.id,
      phone: "156" + String(Date.now()).slice(-8),
      name: "Admin",
      passwordHash: hashPassword(password),
      ...fixtureAccess("admin", org.id),
    },
  });
  const reader = await db.user.create({
    data: {
      organizationId: org.id,
      phone: "157" + String(Date.now()).slice(-8),
      username: randomUUID(),
      name: "Reader",
      passwordHash: hashPassword(password),
      assignments: {
        create: {
          role: {
            create: {
              organizationId: org.id,
              name: "Works reader",
              code: "works-reader",
              permissions: ["works"],
            },
          },
        },
      },
    },
  });
  let storedKey: string | undefined;
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
  ) => {
    const r = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: process.env.APP_ORIGIN!,
        "X-IMP-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const cookie = (
        await call("/auth/login", "POST", { phone: admin.phone, password })
      ).cookie!,
      read = (
        await call("/auth/login", "POST", { phone: reader.phone, password })
      ).cookie!;
    const template = await db.template.create({
      data: {
        organizationId: org.id,
        title: "历史模板",
        description: "test",
        category: "new_product",
      },
    });
    const snapshot = [
      { id: "deleted-person", type: "person", name: "历史人物" },
      { id: "deleted-product", type: "product", name: "历史产品" },
    ];
    const draft = await db.videoCreationDraft.create({
      data: {
        organizationId: org.id,
        creatorId: admin.id,
        templateId: template.id,
        revision: 1,
        title: "100%蛋糕",
        contentTagIds: [],
        publishTags: ["新品", "探店", "template_v1"],
        trackingTagId: "test-tracking",
        requestId: randomUUID(),
        templateSnapshot: { title: "历史模板", revision: 1 },
        materialSnapshot: snapshot,
      },
    });
    const awaiting = await db.videoCreationDraft.create({
      data: {
        organizationId: org.id,
        creatorId: admin.id,
        templateId: template.id,
        revision: 1,
        title: "待生成视频",
        contentTagIds: [],
        publishTags: ["新品"],
        trackingTagId: "test-tracking",
        requestId: randomUUID(),
        templateSnapshot: { title: "历史模板" },
        materialSnapshot: snapshot,
      },
    });
    await db.videoCreationDraft.create({
      data: {
        organizationId: foreign.id,
        creatorId: admin.id,
        templateId: template.id,
        revision: 1,
        title: "foreign-secret",
        contentTagIds: [],
        publishTags: [],
        trackingTagId: "test",
        requestId: randomUUID(),
        templateSnapshot: {},
        materialSnapshot: snapshot,
      },
    });
    let list = await call("/works/library", "GET", undefined, read);
    assert.equal(list.status, 200);
    assert.equal(list.data.total, 2);
    assert.equal(list.data.items[0].downloadUrl, null);
    const buffer = Buffer.from(
      "00000018667479706d703432000000006d70343269736f6d000000086d646174",
      "hex",
    );
    const stored = await storage.upload(
      { buffer, size: buffer.length, mimetype: "video/mp4" } as any,
      org.id,
      "product",
    );
    storedKey = stored.objectKey;
    const asset = await db.asset.create({
      data: {
        ...stored,
        name: "测试视频",
        type: "product",
        organizationId: org.id,
      },
    });
    const created = await call(
      "/works",
      "POST",
      {
        title: "ignored",
        assetId: asset.id,
        creationId: draft.id,
        caption: "这是发布文案",
        publishTags: ["wrong"],
        width: 1080,
        height: 1920,
        generationSeconds: 42,
      },
      cookie,
    );
    assert.equal(created.status, 201);
    await db.work.update({
      where: { id: created.data.id },
      data: { status: "rejected" },
    });
    await db.template.update({
      where: { id: template.id },
      data: { title: "后来修改的模板" },
    });
    list = await call("/works/library", "GET", undefined, read);
    assert.equal(list.data.total, 2);
    const work = list.data.items.find((w: any) => w.kind === "work");
    assert.equal(work.taskStatus, "completed");
    assert.equal(work.caption, "这是发布文案");
    assert.deepEqual(work.publishTags, ["新品", "探店", "template_v1"]);
    assert.equal(work.templateName, "历史模板");
    assert.equal(work.generationSeconds, 42);
    assert.equal(
      list.data.items.find((w: any) => w.id === awaiting.id).downloadUrl,
      null,
    );
    for (const query of [
      "personId=deleted-person",
      "productId=deleted-product",
      `templateId=${template.id}`,
    ])
      assert.equal(
        (await call("/works/library?" + query, "GET", undefined, read)).data
          .total,
        2,
      );
    assert.equal(
      (await call("/works/library?personId=unknown", "GET", undefined, read))
        .data.total,
      0,
    );
    assert.equal(
      (await call("/works/library?status=completed", "GET", undefined, read))
        .data.total,
      1,
    );
    assert.equal(
      (
        await call(
          "/works/library?status=awaiting_provider",
          "GET",
          undefined,
          read,
        )
      ).data.total,
      1,
    );
    assert.equal(
      (await call("/works/library?q=%25", "GET", undefined, read)).data.total,
      1,
    );
    assert.equal(
      (await call("/works/library?q=_", "GET", undefined, read)).data.total,
      0,
    );
    assert.equal(
      (
        await call(
          "/works/library?from=2100-01-01T00:00:00Z",
          "GET",
          undefined,
          read,
        )
      ).data.total,
      0,
    );
    assert.equal(
      (await call("/works/library?status=rejected", "GET", undefined, read))
        .status,
      400,
    );
    const options = await call(
      "/works/library/options",
      "GET",
      undefined,
      read,
    );
    assert.deepEqual(options.data.persons, [
      { value: "deleted-person", label: "历史人物" },
    ]);
    assert.deepEqual(options.data.products, [
      { value: "deleted-product", label: "历史产品" },
    ]);
    const file = await fetch(base + work.downloadUrl, {
      headers: { Cookie: read },
    });
    assert.equal(file.status, 200);
    assert.equal(
      (
        await fetch(base + work.previewUrl, {
          method: "HEAD",
          headers: { Cookie: read },
        })
      ).status,
      200,
    );
    assert.ok(file.headers.get("content-disposition")?.includes("attachment"));
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), buffer);
    const unrelated = await db.asset.create({
      data: {
        organizationId: org.id,
        name: "private-file",
        type: "image",
        objectKey: randomUUID(),
        mimeType: "image/png",
        size: 1,
      },
    });
    assert.equal(
      (await call(`/assets/${unrelated.id}/file`, "GET", undefined, read))
        .status,
      403,
    );
    assert.equal(
      (await call("/works", "POST", { title: "bad", assetId: asset.id }, read))
        .status,
      403,
    );
    assert.equal((await call("/works/library")).status, 401);
  } finally {
    for (const organizationId of [org.id, foreign.id]) {
      await db.work.deleteMany({ where: { organizationId } });
      await db.videoCreationDraft.deleteMany({ where: { organizationId } });
    }
    for (const organizationId of [org.id, foreign.id]) {
      await db.template.deleteMany({ where: { organizationId } });
      await db.asset.deleteMany({ where: { organizationId } });
      await db.auditLog.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { organizationId } });
      await db.accessRole.deleteMany({ where: { organizationId } });
      await db.organization.delete({ where: { id: organizationId } });
    }
    if (storedKey) await storage.remove(storedKey);
    await app.close();
    await db.$disconnect();
  }
});
