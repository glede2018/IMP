import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
test("RBAC: multiple roles, immediate revocation, tenant isolation, administrator protection and no store scope", async () => {
  const db = new PrismaClient();
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const org = await db.organization.create({
    data: { name: "access-test-" + randomUUID() },
  });
  const other = await db.organization.create({
    data: { name: "access-other-" + randomUUID() },
  });
  const phone = "156" + String(Date.now()).slice(-8);
  const password = "test-access-password-2026";
  const admin = await db.user.create({
    data: {
      name: "Admin",
      phone,
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("admin", org.id),
    },
  });
  const foreign = await db.accessRole.create({
    data: { organizationId: other.id, name: "Foreign", code: "foreign" },
  });
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
  ) => {
    const res = await fetch(base + "/api/v1" + path, {
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
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const login = await call("/auth/login", "POST", { phone, password });
    assert.equal(login.status, 200);
    const cookie = login.cookie!;
    assert.equal("storeId" in login.data, false);
    assert(login.data.permissions.includes("*"));
    assert((await call("/auth/me", "GET", undefined, cookie)).data.lastLoginAt);
    const makeRole = async (code: string, permissions: string[]) => {
      const r = await call(
        "/permissions/roles",
        "POST",
        { name: code, code, description: "test", sort: 2, active: true },
        cookie,
      );
      assert.equal(r.status, 201);
      assert.equal(
        (
          await call(
            "/permissions/roles/" + r.data.id + "/permissions",
            "PUT",
            { permissions },
            cookie,
          )
        ).status,
        200,
      );
      return r.data;
    };
    const a = await makeRole("read_assets", ["assets"]);
    const b = await makeRole("read_help", ["help"]);
    assert.equal(
      (
        await call(
          "/permissions/roles/" + a.id + "/permissions",
          "PUT",
          { permissions: ["*"] },
          cookie,
        )
      ).status,
      400,
    );
    const created = await call(
      "/permissions/users",
      "POST",
      {
        username: "test_" + org.id,
        phone: "155" + String(Date.now()).slice(-8),
        name: "测试用户",
        active: true,
        password,
        roleIds: [a.id, b.id],
      },
      cookie,
    );
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert(!JSON.stringify(created.data).includes("passwordHash"));
    assert.equal(created.data.roles.length, 2);
    let member = (
      await call("/auth/login", "POST", {
        account: created.data.username,
        password,
      })
    ).cookie!;
    assert.equal((await call("/assets", "GET", undefined, member)).status, 200);
    assert.equal(
      (await call("/help/resources", "GET", undefined, member)).status,
      200,
    );
    assert.equal(
      (await call("/accounts", "GET", undefined, member)).status,
      403,
    );
    assert.equal(
      (await call("/permissions/users", "GET", undefined, member)).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/permissions/users/" + id + "/roles",
          "PUT",
          { roleIds: [foreign.id] },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/permissions/roles/" + a.id, "DELETE", undefined, cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          "/permissions/roles/" + a.id,
          "PUT",
          {
            name: a.name,
            code: a.code,
            description: "",
            sort: 2,
            active: false,
          },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal((await call("/assets", "GET", undefined, member)).status, 403);
    assert.equal(
      (await call("/help/resources", "GET", undefined, member)).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/permissions/users/" + id + "/password",
          "PUT",
          { password: "replacement-test-password" },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/auth/me", "GET", undefined, member)).status,
      401,
    );
    assert.equal(
      (
        await call(
          "/permissions/users/" + admin.id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/permissions/users/" + admin.id + "/roles",
          "PUT",
          { roleIds: [b.id] },
          cookie,
        )
      ).status,
      400,
    );
    const system = await db.accessRole.findFirstOrThrow({
      where: { organizationId: org.id, system: true },
    });
    assert.equal(
      (
        await call(
          "/permissions/roles/" + system.id,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/permissions/users/" + id, "DELETE", undefined, cookie))
        .status,
      200,
    );
    assert.equal(await db.userRole.count({ where: { userId: id } }), 0);
    assert.equal(
      (await call("/permissions/roles/" + a.id, "DELETE", undefined, cookie))
        .status,
      200,
    );
    const delegate = await makeRole("delegated", ["users"]);
    const d = await call(
      "/permissions/users",
      "POST",
      {
        username: "delegate_" + org.id,
        phone: "154" + String(Date.now()).slice(-8),
        name: "Delegate",
        active: true,
        password,
        roleIds: [delegate.id],
      },
      cookie,
    );
    assert.equal(d.status, 201);
    const delegated = (
      await call("/auth/login", "POST", { account: d.data.username, password })
    ).cookie!;
    assert.equal(
      (
        await call(
          "/permissions/users/" + admin.id + "/password",
          "PUT",
          { password: "malicious-reset-password" },
          delegated,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/permissions/users/" + d.data.id + "/roles",
          "PUT",
          { roleIds: [system.id] },
          delegated,
        )
      ).status,
      400,
    );
  } finally {
    for (const oid of [org.id, other.id]) {
      await db.auditLog.deleteMany({ where: { organizationId: oid } });
      await db.user.deleteMany({ where: { organizationId: oid } });
      await db.accessRole.deleteMany({ where: { organizationId: oid } });
      await db.organization.delete({ where: { id: oid } });
    }
    await app.close();
    await db.$disconnect();
  }
});
