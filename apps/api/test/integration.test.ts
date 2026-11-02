import "dotenv/config";
import { fixtureAccess } from "./access-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
// Import compiled output: Nest requires TypeScript decorator metadata.
const { createApp } = await import("../dist/app.js");
test("real database: sessions, CSRF, isolation, roles, CRUD, review and metrics", async () => {
  const db = new PrismaClient();
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const suffix = randomUUID();
  const orgA = await db.organization.create({
    data: { name: `integration-A-${suffix}` },
  });
  const orgB = await db.organization.create({
    data: { name: `integration-B-${suffix}` },
  });
  const password = "integration-test-password";
  const phones = [
    "159" + String(Date.now()).slice(-8),
    "158" + String(Date.now()).slice(-8),
    "157" + String(Date.now()).slice(-8),
  ];
  const users = await Promise.all([
    db.user.create({
      data: {
        name: "Admin A",
        ...fixtureAccess("admin", orgA.id),
        phone: phones[0],
        role: "admin",
        organizationId: orgA.id,
        passwordHash: hashPassword(password),
      },
    }),
    db.user.create({
      data: {
        name: "Viewer B",
        ...fixtureAccess("viewer", orgB.id),
        phone: phones[1],
        role: "viewer",
        organizationId: orgB.id,
        passwordHash: hashPassword(password),
      },
    }),
    db.user.create({
      data: {
        name: "Operator A",
        ...fixtureAccess("operator", orgA.id),
        phone: phones[2],
        role: "operator",
        organizationId: orgA.id,
        passwordHash: hashPassword(password),
      },
    }),
  ]);
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    csrf = true,
  ) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: process.env.APP_ORIGIN!,
        ...(csrf ? { "X-IMP-Request": "1" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = res.status === 204 ? null : await res.json();
    return { res, data };
  };
  try {
    assert.equal((await call("/auth/me")).res.status, 401);
    assert.equal(
      (
        await call("/auth/login", "POST", {
          phone: phones[0],
          password: "wrong",
        })
      ).res.status,
      401,
    );
    assert.equal(
      (
        await call(
          "/auth/login",
          "POST",
          { phone: phones[0], password },
          undefined,
          false,
        )
      ).res.status,
      403,
    );
    const login = await call("/auth/login", "POST", {
      phone: phones[0],
      password,
    });
    assert.equal(login.res.status, 200);
    assert.ok(login.res.headers.get("set-cookie")?.includes("HttpOnly"));
    const cookie = login.res.headers.get("set-cookie")!.split(";")[0];
    const viewerLogin = await call("/auth/login", "POST", {
      phone: phones[1],
      password,
    });
    const viewer = viewerLogin.res.headers.get("set-cookie")!.split(";")[0];
    const operatorLogin = await call("/auth/login", "POST", {
      phone: phones[2],
      password,
    });
    const operator = operatorLogin.res.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("/auth/me", "GET", undefined, cookie)).data.organizationId,
      orgA.id,
    );
    const account = {
      nickname: "测试账号",
      accountId: suffix,
      platform: "douyin",
      tier: "brand",
    };
    assert.equal(
      (await call("/accounts", "POST", account, cookie, false)).res.status,
      403,
    );
    assert.equal(
      (await call("/accounts", "POST", account, viewer)).res.status,
      403,
    );
    assert.equal(
      (
        await call(
          "/accounts",
          "POST",
          { ...account, organizationId: orgB.id },
          cookie,
        )
      ).res.status,
      400,
    );
    const created = await call("/accounts", "POST", account, cookie);
    assert.equal(created.res.status, 201);
    const id = created.data.id;
    assert.equal(
      (await call("/accounts", "POST", account, cookie)).res.status,
      409,
    );
    assert.equal(
      (await call("/accounts", "GET", undefined, viewer)).data.total,
      0,
    );
    assert.equal(
      (await call(`/accounts/${id}`, "PUT", account, viewer)).res.status,
      403,
    );
    assert.equal(
      (await call("/accounts?page=-1", "GET", undefined, cookie)).res.status,
      400,
    );
    assert.equal(
      (await call("/accounts?q=测试", "GET", undefined, cookie)).data.total,
      1,
    );
    if (process.env.TEST_STORAGE === "true") {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
        "base64",
      );
      const data = new FormData();
      data.append("name", "集成测试图片");
      data.append("type", "image");
      data.append("tags", "测试");
      data.append("file", new Blob([png], { type: "image/png" }), "test.png");
      const uploaded = await fetch(`${base}/api/v1/assets`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: process.env.APP_ORIGIN!,
          "X-IMP-Request": "1",
        },
        body: data,
      });
      assert.equal(uploaded.status, 201);
      const file = (await uploaded.json()) as {
        id: string;
        objectKey?: string;
      };
      assert.equal(file.objectKey, undefined);
      const downloaded = await fetch(`${base}/api/v1/assets/${file.id}/file`, {
        headers: { Cookie: cookie },
      });
      assert.equal(downloaded.status, 200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
      const part = await fetch(`${base}/api/v1/assets/${file.id}/file`, {
        headers: { Cookie: cookie, Range: "bytes=0-7" },
      });
      assert.equal(part.status, 206);
      assert.deepEqual(
        Buffer.from(await part.arrayBuffer()),
        png.subarray(0, 8),
      );
      assert.equal(
        (await call(`/assets/${file.id}/file`, "GET", undefined, viewer)).res
          .status,
        404,
      );
      assert.equal(
        (await call(`/assets/${file.id}`, "DELETE", undefined, cookie)).res
          .status,
        200,
      );
      const invalid = new FormData();
      invalid.append("name", "bad");
      invalid.append("type", "image");
      invalid.append(
        "file",
        new Blob(["not an image"], { type: "image/png" }),
        "bad.png",
      );
      assert.equal(
        (
          await fetch(`${base}/api/v1/assets`, {
            method: "POST",
            headers: {
              Cookie: cookie,
              Origin: process.env.APP_ORIGIN!,
              "X-IMP-Request": "1",
            },
            body: invalid,
          })
        ).status,
        400,
      );
    }
    const template = await call(
      "/templates",
      "POST",
      {
        title: "测试模板",
        description: "说明",
        category: "store",
        tags: [],
        config: { prompt: "test" },
      },
      cookie,
    );
    assert.equal(template.res.status, 201);
    const asset = await db.asset.create({
      data: {
        name: "测试视频",
        type: "product",
        mimeType: "video/mp4",
        size: 12,
        objectKey: `test/${suffix}`,
        organizationId: orgA.id,
      },
    });
    assert.equal(
      (await call(`/assets/${asset.id}/file`, "GET", undefined, viewer)).res
        .status,
      404,
    );
    assert.equal(
      (
        await call(
          "/works",
          "POST",
          { title: "其他组织视频", assetId: asset.id },
          viewer,
        )
      ).res.status,
      403,
    );
    const work = await call(
      "/works",
      "POST",
      { title: "测试作品", assetId: asset.id, templateId: template.data.id },
      operator,
    );
    assert.equal(work.res.status, 201);
    assert.equal(
      (
        await call(
          `/works/${work.data.id}`,
          "PATCH",
          { status: "approved" },
          operator,
        )
      ).res.status,
      403,
    );
    assert.equal(
      (
        await call(
          `/works/${work.data.id}`,
          "PATCH",
          { status: "review" },
          operator,
        )
      ).res.status,
      200,
    );
    assert.equal(
      (
        await call(
          `/works/${work.data.id}`,
          "PATCH",
          { status: "approved" },
          cookie,
        )
      ).res.status,
      200,
    );
    assert.equal(
      (await call(`/assets/${asset.id}`, "DELETE", undefined, cookie)).res
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          `/templates/${template.data.id}`,
          "DELETE",
          undefined,
          cookie,
        )
      ).res.status,
      409,
    );
    assert.equal(
      (await call("/analytics/overview", "GET", undefined, cookie)).data
        .totalWorks,
      1,
    );
    assert.equal(
      (
        await call(
          `/permissions/users/${users[0].id}`,
          "PUT",
          {
            username: users[0].username,
            name: users[0].name,
            phone: users[0].phone,
            active: false,
          },
          cookie,
        )
      ).res.status,
      400,
    );
    assert.equal(
      (await call("/permissions/users", "GET", undefined, operator)).res.status,
      403,
    );
    assert.equal(
      (await call("/auth/logout", "POST", undefined, cookie)).res.status,
      204,
    );
    assert.equal(
      (await call("/auth/me", "GET", undefined, cookie)).res.status,
      401,
    );
  } finally {
    await db.work.deleteMany({ where: { organizationId: orgA.id } });
    await db.template.deleteMany({ where: { organizationId: orgA.id } });
    await db.asset.deleteMany({ where: { organizationId: orgA.id } });
    await db.account.deleteMany({ where: { organizationId: orgA.id } });
    await db.auditLog.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.accessRole.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await app.close();
    await db.$disconnect();
  }
});
