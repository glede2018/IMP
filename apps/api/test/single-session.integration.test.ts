import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, tokenHash } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
import { createApp } from "../dist/app.js";

test("同一账号仅保留一个会话，错误密码不踢出，会话切换和并发登录保持一致", async () => {
  const db = new PrismaClient(),
    app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const org = await db.organization.create({
    data: { name: "single-session-" + randomUUID() },
  });
  const password = "single-session-test-password";
  const user = await db.user.create({
    data: {
      organizationId: org.id,
      phone: "150" + String(Date.now()).slice(-8),
      name: "会话测试",
      passwordHash: hashPassword(password),
      ...fixtureAccess("admin", org.id),
    },
  });
  const call = async (path: string, body?: unknown, cookie?: string) => {
    const response = await fetch(base + "/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: process.env.APP_ORIGIN!,
        "X-IMP-Request": "1",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      data: response.status === 204 ? null : await response.json(),
    };
  };
  try {
    const first = await call("/auth/login", { phone: user.phone, password });
    assert.equal(first.status, 200);
    assert.equal((await call("/auth/me", undefined, first.cookie)).status, 200);
    const invalid = await call("/auth/login", {
      phone: user.phone,
      password: "wrong",
    });
    assert.equal(invalid.status, 401);
    assert.equal((await call("/auth/me", undefined, first.cookie)).status, 200);
    // 旧设备尚未完成的授权流程必须随旧会话撤销。
    const state = await db.oAuthState.create({
      data: {
        id: randomUUID(),
        sessionId: tokenHash(first.cookie!.split("=")[1]),
        organizationId: org.id,
        actorId: user.id,
        tier: "brand",
        mode: "demo",
        clientKey: "test",
        redirectUri: "http://localhost",
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const second = await call("/auth/login", {
      account: user.username,
      password,
    });
    assert.equal(second.status, 200);
    assert.notEqual(first.cookie, second.cookie);
    const expired = await call("/auth/me", undefined, first.cookie);
    assert.equal(expired.status, 401);
    assert.match(expired.data.message, /同一账号/);
    assert.equal(
      await db.oAuthState.findUnique({ where: { id: state.id } }),
      null,
    );
    assert.equal(
      (await call("/auth/me", undefined, second.cookie)).status,
      200,
    );
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    // 并发请求均可完成，但只有最后提交的会话继续有效。
    const parallel = await Promise.all(
      Array.from({ length: 3 }, () =>
        call("/auth/login", { account: user.username, password }),
      ),
    );
    assert.ok(parallel.every((response) => response.status === 200));
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    const statuses = await Promise.all(
      parallel.map((response) => call("/auth/me", undefined, response.cookie)),
    );
    assert.equal(
      statuses.filter((response) => response.status === 200).length,
      1,
    );
    assert.equal(
      statuses.filter((response) => response.status === 401).length,
      2,
    );
    assert.equal(
      (await call("/auth/me", undefined, second.cookie)).status,
      401,
    );
    const winner =
      parallel[statuses.findIndex((response) => response.status === 200)];
    // 旧会话发起退出不能删掉新会话。
    assert.equal((await call("/auth/logout", {}, first.cookie)).status, 401);
    assert.equal(
      (await call("/auth/me", undefined, winner.cookie)).status,
      200,
    );
    assert.equal((await call("/auth/logout", {}, winner.cookie)).status, 204);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  } finally {
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.accessRole.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await app.close();
    await db.$disconnect();
  }
});
