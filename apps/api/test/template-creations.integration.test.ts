import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
test("template creations: managed multiple tags, automatic identity, snapshots, revision and idempotency", async () => {
  const db = new PrismaClient(),
    app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const org = await db.organization.create({
      data: { name: "creation-test-" + randomUUID() },
    }),
    other = await db.organization.create({
      data: { name: "other-" + randomUUID() },
    });
  const password = "creation-test-password";
  const user = await db.user.create({
    data: {
      phone: "153" + String(Date.now()).slice(-8),
      name: "Creator",
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("admin", org.id),
    },
  });
  const reader = await db.user.create({
    data: {
      phone: "154" + String(Date.now()).slice(-8),
      name: "Reader",
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("viewer", org.id),
    },
  });
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
        await call("/auth/login", "POST", { phone: user.phone, password })
      ).cookie!,
      read = (
        await call("/auth/login", "POST", { phone: reader.phone, password })
      ).cookie!;
    const template = await db.template.create({
      data: {
        organizationId: org.id,
        title: "新品宣传",
        description: "test",
        category: "new_product",
        config: { slots: ["person", "product"] },
      },
    });
    const foreign = await db.template.create({
      data: {
        organizationId: other.id,
        title: "Other",
        description: "test",
        category: "new_product",
      },
    });
    assert.equal(
      (await call(`/templates/${template.id}/prepare`, "POST", {}, read))
        .status,
      403,
    );
    assert.equal(
      (await call(`/templates/${foreign.id}/prepare`, "POST", {}, cookie))
        .status,
      404,
    );
    const first = await call(
      `/templates/${template.id}/prepare`,
      "POST",
      {},
      cookie,
    );
    assert.equal(first.status, 201);
    assert.equal(first.data.template.revision, 1);
    const next = await call(
      `/templates/${template.id}/prepare`,
      "POST",
      {},
      cookie,
    );
    assert.equal(next.data.trackingTag.id, first.data.trackingTag.id);
    const topics = [];
    for (const [name, code] of [
      ["新品", "NEW"],
      ["探店", "STORE"],
    ])
      topics.push(
        (
          await call(
            "/tags",
            "POST",
            { name, code, description: "topic", active: true, sort: 0 },
            cookie,
          )
        ).data,
      );
    const person = await db.material.create({
        data: {
          organizationId: org.id,
          name: "人物",
          type: "person",
          creatorId: user.id,
          creatorName: user.name,
        },
      }),
      product = await db.material.create({
        data: {
          organizationId: org.id,
          name: "蛋糕",
          type: "product",
          creatorId: user.id,
          creatorName: user.name,
        },
      });
    for (const m of [person, product]) {
      const asset = await db.asset.create({
        data: {
          organizationId: org.id,
          name: m.name,
          type: "image",
          mimeType: "image/png",
          objectKey: randomUUID(),
          size: 10,
        },
      });
      await db.materialFile.create({
        data: { materialId: m.id, assetId: asset.id, position: 0 },
      });
    }
    const dto = {
      title: "新品宣传视频",
      revision: 1,
      personMaterialId: person.id,
      productMaterialIds: [product.id],
      tagIds: topics.map((t) => t.id),
      requestId: randomUUID(),
    };
    const context = await call(
      `/templates/${template.id}/prepare`,
      "POST",
      {},
      cookie,
    );
    assert.equal(context.data.tags.length, 2);
    const created = await call(
      `/templates/${template.id}/creations`,
      "POST",
      dto,
      cookie,
    );
    assert.equal(created.status, 201);
    assert.equal(created.data.status, "awaiting_provider");
    assert.deepEqual(created.data.publishTags, [
      "新品",
      "探店",
      first.data.trackingTag.name,
    ]);
    assert.equal(
      (await call(`/templates/${template.id}/creations`, "POST", dto, cookie))
        .data.id,
      created.data.id,
    );
    assert.equal(
      await db.videoCreationDraft.count({ where: { organizationId: org.id } }),
      1,
    );
    assert.equal(
      (
        await call(
          `/templates/${template.id}/creations`,
          "POST",
          { ...dto, title: "另一个视频" },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `/templates/${template.id}/creations`,
          "POST",
          {
            ...dto,
            requestId: randomUUID(),
            tagIds: [topics[0].id, topics[0].id],
          },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `/templates/${template.id}/creations`,
          "POST",
          { ...dto, requestId: randomUUID(), personMaterialId: product.id },
          cookie,
        )
      ).status,
      400,
    );
    await call(
      `/tags/${topics[0].id}`,
      "PUT",
      { name: "新品", code: "NEW", description: "", sort: 0, active: false },
      cookie,
    );
    assert.equal(
      (
        await call(
          `/templates/${template.id}/creations`,
          "POST",
          { ...dto, requestId: randomUUID() },
          cookie,
        )
      ).status,
      400,
    );
    const update = await call(
      `/templates/${template.id}`,
      "PUT",
      {
        title: template.title,
        description: template.description,
        category: template.category,
        tags: [],
        config: { slots: ["new"] },
      },
      cookie,
    );
    assert.equal(update.status, 200);
    assert.equal(update.data.revision, 2);
    assert.equal(
      (
        await call(
          `/templates/${template.id}/creations`,
          "POST",
          { ...dto, requestId: randomUUID() },
          cookie,
        )
      ).status,
      409,
    );
    const v2 = await call(
      `/templates/${template.id}/prepare`,
      "POST",
      {},
      cookie,
    );
    assert.notEqual(v2.data.trackingTag.tag, first.data.trackingTag.tag);
    const draft = await db.videoCreationDraft.findUniqueOrThrow({
      where: { id: created.data.id },
    });
    assert.deepEqual((draft.templateSnapshot as any).config, {
      slots: ["person", "product"],
    });
    assert.deepEqual(draft.publishTags, created.data.publishTags);
  } finally {
    for (const organizationId of [org.id, other.id]) {
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
    await app.close();
    await db.$disconnect();
  }
});
