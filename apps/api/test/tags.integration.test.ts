import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
test("publish tags: shared template binding, CRUD, filters, uniqueness, history and tenant isolation", async () => {
  const db = new PrismaClient(),
    app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const orgs = await Promise.all(
    ["tags", "other"].map((name) =>
      db.organization.create({ data: { name: name + randomUUID() } }),
    ),
  );
  const password = "tags-test-password",
    users = [];
  for (const [i, org] of orgs.entries())
    users.push(
      await db.user.create({
        data: {
          phone: "151" + String(Date.now() + i).slice(-8),
          name: "Admin",
          passwordHash: hashPassword(password),
          organizationId: org.id,
          ...fixtureAccess("admin", org.id),
        },
      }),
    );
  const reader = await db.user.create({
    data: {
      phone: "152" + String(Date.now()).slice(-8),
      username: randomUUID(),
      name: "Reader",
      passwordHash: hashPassword(password),
      organizationId: orgs[0].id,
      assignments: {
        create: {
          role: {
            create: {
              organizationId: orgs[0].id,
              name: "Reader",
              code: "reader",
              permissions: ["tags"],
            },
          },
        },
      },
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
    const [cookie, other, read] = await Promise.all(
      [...users, reader].map(
        async (u) =>
          (await call("/auth/login", "POST", { phone: u.phone, password }))
            .cookie!,
      ),
    );
    assert.equal((await call("/tags")).status, 401);
    const dto = {
      name: "视频类型",
      code: "VIDEO_TYPE",
      description: "标记视频内容类型",
      sort: 1,
      active: true,
    };
    const created = await call("/tags", "POST", dto, cookie);
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal((await call("/tags", "POST", dto, cookie)).status, 409);
    for (const v of [
      { ...dto, code: "bad-code" },
      { ...dto, name: "  " },
      { ...dto, sort: -1 },
      { ...dto, active: "true" },
      { ...dto, description: "a".repeat(201) },
    ])
      assert.equal((await call("/tags", "POST", v, cookie)).status, 400);
    assert.equal(
      (await call("/tags", "POST", { ...dto, code: "OTHER" }, read)).status,
      403,
    );
    assert.equal((await call(`/tags/${id}`, "PUT", dto, other)).status, 404);
    const template = await db.template.create({
      data: {
        organizationId: orgs[0].id,
        title: "Tag template",
        description: "test",
        category: "new_product",
      },
    });
    const bind = await call(
      "/analytics/douyin/tags",
      "POST",
      { templateId: template.id, version: "v1", tag: "#视频类型" },
      cookie,
    );
    assert.equal(bind.status, 201);
    assert.equal(bind.data.id, id);
    assert.equal(
      await db.templateTrackingTag.count({
        where: { organizationId: orgs[0].id },
      }),
      1,
    );
    assert.equal(
      (await call(`/tags/${id}`, "PUT", { ...dto, name: "另一个tag" }, cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          "/analytics/douyin/tags",
          "POST",
          { templateId: template.id, version: "v2", tag: "视频类型" },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call(`/tags/${id}`, "PUT", { ...dto, active: false }, cookie))
        .status,
      200,
    );
    const filtered = await call(
      "/tags?name=视频&code=VIDEO&active=false&page=1&pageSize=10",
      "GET",
      undefined,
      read,
    );
    assert.equal(filtered.data.total, 1);
    assert.equal("_count" in filtered.data.items[0], false);
    assert.equal(
      (await call("/analytics/douyin/tags", "GET", undefined, cookie)).data
        .length,
      0,
    );
    assert.equal(
      (await call("/tags?active=true", "GET", undefined, cookie)).data.total,
      0,
    );
    assert.equal(
      (await call("/tags?page=1.5", "GET", undefined, cookie)).status,
      400,
    );
    assert.equal(
      (await call(`/tags/${id}`, "DELETE", undefined, read)).status,
      403,
    );
    assert.equal(
      (await call(`/tags/${id}`, "DELETE", undefined, cookie)).status,
      200,
    );
    assert.equal((await call("/tags", "GET", undefined, cookie)).data.total, 0);
    const historic = await db.templateTrackingTag.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(historic.templateId, template.id);
    assert.ok(historic.deletedAt);
    assert.equal((await call("/tags", "POST", dto, cookie)).status, 409);
    assert.ok(
      await db.auditLog.count({
        where: { organizationId: orgs[0].id, action: "tag.delete" },
      }),
    );
  } finally {
    for (const org of orgs) {
      await db.templateTrackingTag.deleteMany({
        where: { organizationId: org.id },
      });
      await db.template.deleteMany({ where: { organizationId: org.id } });
      await db.auditLog.deleteMany({ where: { organizationId: org.id } });
      await db.user.deleteMany({ where: { organizationId: org.id } });
      await db.accessRole.deleteMany({ where: { organizationId: org.id } });
      await db.organization.delete({ where: { id: org.id } });
    }
    await app.close();
    await db.$disconnect();
  }
});
