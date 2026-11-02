import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
import { Storage } from "../dist/storage.js";
const { createApp } = await import("../dist/app.js");
test("material library: storage, validation, ordering, search, tenant default, soft deletion and immutable work snapshot", async () => {
  const db = new PrismaClient();
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const storage = app.get(Storage);
  const org = await db.organization.create({
    data: { name: "materials-" + randomUUID() },
  });
  const other = await db.organization.create({
    data: { name: "materials-other-" + randomUUID() },
  });
  const password = "material-test-password";
  const phone = "152" + String(Date.now()).slice(-8);
  await db.user.create({
    data: {
      name: "测试创建者",
      phone,
      organizationId: org.id,
      passwordHash: hashPassword(password),
      ...fixtureAccess("admin", org.id),
    },
  });
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
  ) => {
    const form = body instanceof FormData;
    const res = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        Origin: process.env.APP_ORIGIN!,
        "X-IMP-Request": "1",
        ...(!form ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body
        ? { body: form ? (body as FormData) : JSON.stringify(body) }
        : {}),
    });
    return {
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const cookie = (await call("/auth/login", "POST", { phone, password }))
      .cookie!;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=",
      "base64",
    );
    const upload = async (bytes: Buffer, mime = "image/png") => {
      const f = new FormData();
      f.append("file", new Blob([bytes], { type: mime }), "sample.png");
      return call("/materials/files", "POST", f, cookie);
    };
    const first = await upload(png);
    const second = await upload(png);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal((await upload(Buffer.from("not-an-image"))).status, 400);
    assert.equal((await upload(Buffer.alloc(3 * 1024 * 1024 + 1))).status, 413);
    await db.materialCategory.create({
      data: {
        organizationId: org.id,
        name: "食品",
        children: { create: { organizationId: org.id, name: "蛋糕" } },
      },
    });
    const product = {
      type: "product",
      name: "草莓蛋糕",
      description: "当季新鲜草莓与淡奶油",
      categoryPath: ["食品", "蛋糕"],
      tags: ["新品推荐"],
      priceCents: 12990,
      fileIds: [first.data.id, second.data.id],
      isDefault: false,
    };
    const created = await call("/materials", "POST", product, cookie);
    assert.equal(created.status, 201);
    assert(!JSON.stringify(created.data).includes("objectKey"));
    assert.equal(created.data.creatorName, "测试创建者");
    const materialId = created.data.id;
    assert.equal(
      (
        await call(
          "/materials?type=product&q=" + encodeURIComponent("品推"),
          "GET",
          undefined,
          cookie,
        )
      ).data.total,
      1,
    );
    assert.equal(
      (
        await call(
          "/materials?type=product&q=" + encodeURIComponent("淡奶油"),
          "GET",
          undefined,
          cookie,
        )
      ).data.total,
      1,
    );
    assert.equal(
      (
        await call(
          "/materials?type=product&from=2100-01-01T00:00:00Z",
          "GET",
          undefined,
          cookie,
        )
      ).data.total,
      0,
    );
    assert.equal(
      (
        await call(
          "/materials?type=product&from=2100-01-01T00:00:00Z&to=2000-01-01T00:00:00Z",
          "GET",
          undefined,
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/materials",
          "POST",
          { ...product, fileIds: Array(11).fill(first.data.id) },
          cookie,
        )
      ).status,
      400,
    );
    const foreign = await db.asset.create({
      data: {
        organizationId: other.id,
        type: "image",
        name: "foreign",
        objectKey: randomUUID(),
        mimeType: "image/png",
        size: 1,
      },
    });
    assert.equal(
      (
        await call(
          "/materials",
          "POST",
          { ...product, fileIds: [foreign.id] },
          cookie,
        )
      ).status,
      400,
    );
    const video = await db.asset.create({
      data: {
        organizationId: org.id,
        type: "product",
        name: "Test output",
        objectKey: randomUUID(),
        mimeType: "video/mp4",
        size: 1,
      },
    });
    const work = await call(
      "/works",
      "POST",
      { title: "历史作品", assetId: video.id, materialIds: [materialId] },
      cookie,
    );
    assert.equal(work.status, 201);
    assert.equal(work.data.materialSnapshot[0].name, "草莓蛋糕");
    const updated = await call(
      "/materials/" + materialId,
      "PUT",
      {
        ...product,
        name: "新版蛋糕",
        priceCents: 19900,
        fileIds: [second.data.id, first.data.id],
      },
      cookie,
    );
    assert.equal(updated.status, 200);
    assert.deepEqual(
      updated.data.files.map((f: { id: string }) => f.id),
      [second.data.id, first.data.id],
    );
    assert.equal(
      (await db.work.findUniqueOrThrow({ where: { id: work.data.id } }))
        .materialSnapshot[0].name,
      "草莓蛋糕",
    );
    const voice = await db.asset.create({
      data: {
        organizationId: org.id,
        type: "voice",
        name: "温柔女声",
        objectKey: randomUUID(),
        mimeType: "audio/wav",
        size: 1,
      },
    });
    const person = {
      type: "person",
      name: "小满",
      description: "温暖亲切的门店讲解员",
      categoryPath: [],
      tags: [],
      priceCents: 0,
      fileIds: [first.data.id],
      isDefault: false,
      voiceAssetId: voice.id,
    };
    assert.equal(
      (
        await call(
          "/materials",
          "POST",
          { ...person, voiceAssetId: undefined },
          cookie,
        )
      ).status,
      400,
    );
    const a = await call("/materials", "POST", person, cookie);
    const b = await call(
      "/materials",
      "POST",
      { ...person, name: "小雨", isDefault: true },
      cookie,
    );
    assert.equal(a.status, 201);
    assert.equal(a.data.isDefault, true);
    assert.equal(b.status, 201);
    assert.equal(
      await db.material.count({
        where: {
          organizationId: org.id,
          type: "person",
          isDefault: true,
          deletedAt: null,
        },
      }),
      1,
    );
    assert.equal(
      (
        await call(
          "/materials/" + b.data.id + "/generate",
          "POST",
          undefined,
          cookie,
        )
      ).status,
      503,
    );
    assert.equal(
      (await call("/materials/capabilities", "GET", undefined, cookie)).data
        .digitalHumanReady,
      false,
    );
    await call("/materials/" + b.data.id, "DELETE", undefined, cookie);
    assert.equal(
      (await db.material.findUniqueOrThrow({ where: { id: a.data.id } }))
        .isDefault,
      true,
    );
    assert.equal(
      (
        await call(
          "/materials?type=person&q=" + encodeURIComponent("门店"),
          "GET",
          undefined,
          cookie,
        )
      ).data.total,
      0,
    );
    assert.equal(
      (await call("/materials/" + materialId, "DELETE", undefined, cookie))
        .status,
      200,
    );
    assert.equal(
      (await call("/materials?type=product", "GET", undefined, cookie)).data
        .total,
      0,
    );
    assert.equal(
      (
        await call(
          "/works",
          "POST",
          { title: "不可新建", assetId: video.id, materialIds: [materialId] },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/assets/" + first.data.id, "DELETE", undefined, cookie))
        .status,
      409,
    );
    const response = await fetch(
      base + "/api/v1/assets/" + first.data.id + "/file",
      { headers: { Cookie: cookie } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal(
      (await db.work.findUniqueOrThrow({ where: { id: work.data.id } }))
        .materialSnapshot[0].priceCents,
      12990,
    );
    const legacy = await db.material.create({
      data: {
        organizationId: org.id,
        type: "product",
        name: "历史视频素材",
        creatorId: "legacy",
        creatorName: "历史导入",
        files: { create: { assetId: video.id, position: 0 } },
      },
    });
    assert.equal(
      (await call("/materials/" + legacy.id, "DELETE", undefined, cookie))
        .status,
      200,
    );
    assert.equal(
      (
        await call(
          "/works",
          "POST",
          { title: "不可绕过删除校验", assetId: video.id },
          cookie,
        )
      ).status,
      400,
    );
  } finally {
    for (const oid of [org.id, other.id]) {
      const assets = await db.asset.findMany({
        where: { organizationId: oid },
      });
      for (const a of assets)
        await storage.remove(a.objectKey).catch(() => undefined);
      await db.work.deleteMany({ where: { organizationId: oid } });
      await db.material.deleteMany({ where: { organizationId: oid } });
      await db.asset.deleteMany({ where: { organizationId: oid } });
      await db.auditLog.deleteMany({ where: { organizationId: oid } });
      await db.user.deleteMany({ where: { organizationId: oid } });
      await db.accessRole.deleteMany({ where: { organizationId: oid } });
      for (let depth = 0; depth < 5; depth++)
        await db.materialCategory.deleteMany({
          where: { organizationId: oid, children: { none: {} } },
        });
      await db.organization.delete({ where: { id: oid } });
    }
    await app.close();
    await db.$disconnect();
  }
});
