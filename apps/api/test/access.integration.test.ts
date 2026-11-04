import { AccessController } from "../dist/access.js";
import { Storage } from "../dist/storage.js";
import "../load-env.mjs";
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
    const catalog = (
      await call("/permissions/catalog", "GET", undefined, cookie)
    ).data;
    assert.equal(
      catalog.find((p: any) => p.key === "accounts").label,
      "账号查看",
    );
    assert.equal(
      catalog.find((p: any) => p.key === "accounts:write").label,
      "账号管理",
    );
    assert.equal(
      catalog.find((p: any) => p.key === "accounts").group,
      catalog.find((p: any) => p.key === "accounts:write").group,
    );
    const roleManager = await makeRole("role_manager", ["roles", "accounts"]);
    const superior = await makeRole("superior_unused", [
      "accounts",
      "accounts:write",
    ]);
    const targetRole = await makeRole("target_unused", []);
    const manager = await call(
      "/permissions/users",
      "POST",
      {
        username: "role_manager_" + org.id,
        phone: "152" + String(Date.now()).slice(-8),
        name: "角色管理员",
        active: true,
        password,
        roleIds: [roleManager.id],
      },
      cookie,
    );
    assert.equal(manager.status, 201);
    const managerCookie = (
      await call("/auth/login", "POST", {
        account: manager.data.username,
        password,
      })
    ).cookie!;
    assert.equal(
      (
        await call(
          `/permissions/roles/${superior.id}`,
          "DELETE",
          undefined,
          managerCookie,
        )
      ).status,
      403,
    );
    assert.ok(await db.accessRole.findUnique({ where: { id: superior.id } }));
    assert.equal(
      (
        await call(
          `/permissions/roles/${targetRole.id}/permissions`,
          "PUT",
          { permissions: ["accounts", "accounts:write"] },
          managerCookie,
        )
      ).status,
      403,
    );
    // 模拟请求已通过初始鉴权、但等待事务期间操作者的账号权限被撤回。
    const staleActor = await db.user.findUniqueOrThrow({
      where: { id: manager.data.id },
      include: { assignments: { include: { role: true } } },
    });
    await db.accessRole.update({
      where: { id: roleManager.id },
      data: { permissions: ["roles"] },
    });
    await assert.rejects(
      app
        .get(AccessController)
        .grant(targetRole.id, { permissions: ["accounts"] }, {
          user: staleActor,
        } as any),
      /不能分配超出自身范围/,
    );
    assert.deepEqual(
      (await db.accessRole.findUniqueOrThrow({ where: { id: targetRole.id } }))
        .permissions,
      [],
    );
    assert.equal(
      catalog.find((p: any) => p.key === "templates:create").label,
      "添加模板",
    );
    const storage = app.get(Storage);
    const originalUpload = storage.upload.bind(storage);
    const originalLinks = storage.links.bind(storage);
    const uploadCover = async () => {
      const data = new FormData();
      data.append(
        "file",
        new Blob(["test"], { type: "image/png" }),
        "cover.png",
      );
      return fetch(base + "/api/v1/templates/cover", {
        method: "POST",
        headers: {
          Origin: process.env.APP_ORIGIN!,
          "X-IMP-Request": "1",
          Cookie: managerCookie,
        },
        body: data,
      });
    };
    // 封面上传使用存储桩，验证模板授权不依赖素材权限，也不访问真实 OSS。
    let uploadCount = 0;
    storage.upload = async () => {
      uploadCount++;
      return {
        objectKey: `templates/test/${randomUUID()}.png`,
        mimeType: "image/png",
        size: 4,
      };
    };
    storage.links = async () => ({
      preview: "https://example.com/cover.png",
      downloadUrl: "https://example.com/cover.png",
    });
    const templateDto = {
      title: "权限测试模板",
      description: "测试",
      category: "store",
      tags: [],
      config: { prompt: "test" },
    };
    try {
      for (const permissions of [
        ["templates"],
        ["templates", "templates:write"],
      ]) {
        await db.accessRole.update({
          where: { id: roleManager.id },
          data: { permissions },
        });
        assert.equal(
          (await call("/templates", "GET", undefined, managerCookie)).status,
          200,
        );
        assert.equal(
          (await call("/templates", "POST", templateDto, managerCookie)).status,
          403,
        );
        assert.equal((await uploadCover()).status, 403);
      }
      assert.equal(uploadCount, 0);
      await db.accessRole.update({
        where: { id: roleManager.id },
        data: { permissions: ["templates", "templates:create"] },
      });
      const coverResponse = await uploadCover();
      assert.equal(coverResponse.status, 201);
      const cover = await coverResponse.json();
      const added = await call(
        "/templates",
        "POST",
        { ...templateDto, coverAssetId: cover.id },
        managerCookie,
      );
      assert.equal(added.status, 201);
      assert.equal(uploadCount, 1);
      assert.equal(
        (
          await call(
            `/templates/${added.data.id}`,
            "PUT",
            templateDto,
            managerCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/templates/${added.data.id}`,
            "DELETE",
            undefined,
            managerCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call("/assets", "GET", undefined, managerCookie)).status,
        403,
      );
    } finally {
      storage.upload = originalUpload;
      storage.links = originalLinks;
    }
  } finally {
    for (const oid of [org.id, other.id]) {
      await db.template.deleteMany({ where: { organizationId: oid } });
      await db.asset.deleteMany({ where: { organizationId: oid } });
      await db.auditLog.deleteMany({ where: { organizationId: oid } });
      await db.user.deleteMany({ where: { organizationId: oid } });
      await db.accessRole.deleteMany({ where: { organizationId: oid } });
      await db.organization.delete({ where: { id: oid } });
    }
    await app.close();
    await db.$disconnect();
  }
});
