import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
test("categories: tenant tree CRUD, cycle/depth/duplicate protection, material paths and history", async () => {
  const db = new PrismaClient();
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const org = await db.organization.create({
    data: { name: "categories-" + randomUUID() },
  });
  const other = await db.organization.create({
    data: { name: "categories-other-" + randomUUID() },
  });
  const password = "categories-test-password";
  const phone = "150" + String(Date.now()).slice(-8);
  await db.user.create({
    data: {
      phone,
      name: "Admin",
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("admin", org.id),
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
    const cookie = (await call("/auth/login", "POST", { phone, password }))
      .cookie!;
    const defaults = await call(
      "/material-categories",
      "GET",
      undefined,
      cookie,
    );
    assert.equal(defaults.status, 200);
    assert.equal(defaults.data.length, 1);
    assert.equal(defaults.data[0].system, true);
    const root = await call(
      "/material-categories",
      "POST",
      { name: "烘焙", sort: 1 },
      cookie,
    );
    assert.equal(root.status, 201);
    const child = await call(
      "/material-categories",
      "POST",
      { name: "蛋糕", parentId: root.data.id, sort: 2 },
      cookie,
    );
    assert.equal(child.status, 201);
    assert.equal(
      (
        await call(
          "/material-categories",
          "POST",
          { name: "蛋糕", parentId: root.data.id, sort: 0 },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/material-categories/" + root.data.id,
          "PUT",
          { name: "烘焙", parentId: child.data.id, sort: 0 },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/material-categories/" + root.data.id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/material-categories/" + defaults.data[0].id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      400,
    );
    const foreign = await db.materialCategory.create({
      data: { organizationId: other.id, name: "Foreign" },
    });
    assert.equal(
      (
        await call(
          "/material-categories",
          "POST",
          { name: "跨组织", parentId: foreign.id, sort: 0 },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/material-categories/" + foreign.id,
          "PUT",
          { name: "Bad", sort: 0 },
          cookie,
        )
      ).status,
      404,
    );
    const material = await db.material.create({
      data: {
        organizationId: org.id,
        type: "product",
        name: "测试产品",
        categoryId: child.data.id,
        categoryPath: ["烘焙", "蛋糕"],
        creatorId: "test",
        creatorName: "Test",
      },
    });
    assert.equal(
      (
        await call(
          "/material-categories/" + child.data.id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      409,
    );
    const rename = await call(
      "/material-categories/" + root.data.id,
      "PUT",
      { name: "甜品", sort: 9 },
      cookie,
    );
    assert.equal(rename.status, 200);
    assert.deepEqual(
      (await db.material.findUniqueOrThrow({ where: { id: material.id } }))
        .categoryPath,
      ["甜品", "蛋糕"],
    );
    const branch = await call(
      "/material-categories",
      "POST",
      { name: "节日", sort: 3 },
      cookie,
    );
    assert.equal(
      (
        await call(
          "/material-categories/" + child.data.id,
          "PUT",
          { name: "生日蛋糕", parentId: branch.data.id, sort: 0 },
          cookie,
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await db.material.findUniqueOrThrow({ where: { id: material.id } }))
        .categoryPath,
      ["节日", "生日蛋糕"],
    );
    const image = await db.asset.create({
      data: {
        organizationId: org.id,
        type: "image",
        name: "test",
        objectKey: randomUUID(),
        mimeType: "image/png",
        size: 10,
      },
    });
    const payload = {
      type: "product",
      name: "新增",
      description: "说明",
      categoryId: child.data.id,
      categoryPath: [],
      tags: [],
      priceCents: 0,
      fileIds: [image.id],
      isDefault: false,
    };
    const saved = await call("/materials", "POST", payload, cookie);
    assert.equal(saved.status, 201);
    assert.deepEqual(saved.data.categoryPath, ["节日", "生日蛋糕"]);
    assert.equal(
      (
        await call(
          "/materials",
          "POST",
          { ...payload, categoryId: foreign.id },
          cookie,
        )
      ).status,
      400,
    );
    let parent = child.data.id;
    for (let i = 0; i < 3; i++) {
      const r = await call(
        "/material-categories",
        "POST",
        { name: "层级" + i, parentId: parent, sort: 0 },
        cookie,
      );
      assert.equal(r.status, 201);
      parent = r.data.id;
    }
    assert.equal(
      (
        await call(
          "/material-categories",
          "POST",
          { name: "超限", parentId: parent, sort: 0 },
          cookie,
        )
      ).status,
      400,
    );
    await db.material.updateMany({
      where: { organizationId: org.id },
      data: { deletedAt: new Date() },
    });
    // Deleting an unused leaf keeps the soft-deleted material's historical category text.
    const leaf = await call(
      "/material-categories",
      "POST",
      { name: "历史分类", sort: 0 },
      cookie,
    );
    await db.material.update({
      where: { id: material.id },
      data: { categoryId: leaf.data.id, categoryPath: ["历史分类"] },
    });
    assert.equal(
      (
        await call(
          "/material-categories/" + leaf.data.id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      200,
    );
    const old = await db.material.findUniqueOrThrow({
      where: { id: material.id },
    });
    assert.equal(old.categoryId, null);
    assert.deepEqual(old.categoryPath, ["历史分类"]);
  } finally {
    for (const id of [org.id, other.id]) {
      await db.material.deleteMany({ where: { organizationId: id } });
      await db.asset.deleteMany({ where: { organizationId: id } });
      for (let depth = 0; depth < 5; depth++)
        await db.materialCategory.deleteMany({
          where: { organizationId: id, children: { none: {} } },
        });
      await db.auditLog.deleteMany({ where: { organizationId: id } });
      await db.user.deleteMany({ where: { organizationId: id } });
      await db.accessRole.deleteMany({ where: { organizationId: id } });
      await db.organization.delete({ where: { id } });
    }
    await app.close();
    await db.$disconnect();
  }
});
