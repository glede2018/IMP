import "../load-env.mjs";
import { fixtureAccess } from "./access-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, tokenHash } from "../src/security.js";
const { createApp } = await import("../dist/app.js");
const { DouyinProvider, DouyinApiError } =
  await import("../dist/douyin-provider.js");

test("Douyin OAuth: real database, official contract fixture, states, isolation, encryption, refresh and unlink", async () => {
  const envNames = [
    "APP_ORIGIN",
    "DOUYIN_CLIENT_KEY",
    "DOUYIN_CLIENT_SECRET",
    "DOUYIN_REDIRECT_URI",
    "DOUYIN_SCOPES",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "DOUYIN_DEMO_ENABLED",
  ];
  const previous = Object.fromEntries(envNames.map((n) => [n, process.env[n]]));
  Object.assign(process.env, {
    APP_ORIGIN: "https://oauth.example.test",
    DOUYIN_CLIENT_KEY: "integration-client",
    DOUYIN_CLIENT_SECRET: "integration-secret",
    DOUYIN_REDIRECT_URI:
      "https://oauth.example.test/api/v1/oauth/douyin/callback",
    DOUYIN_SCOPES: "user_info",
    OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DOUYIN_DEMO_ENABLED: "true",
  });
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "oauth-integration-password";
  const orgA = await db.organization.create({
    data: { name: `oauth-A-${suffix}` },
  });
  const orgB = await db.organization.create({
    data: { name: `oauth-B-${suffix}` },
  });
  const users = await Promise.all(
    ["admin", "operator", "viewer", "admin"].map((role, i) =>
      db.user.create({
        data: {
          organizationId: i === 3 ? orgB.id : orgA.id,
          name: `OAuth user ${i}`,
          role: role as "admin" | "operator" | "viewer",
          ...fixtureAccess(role, i === 3 ? orgB.id : orgA.id),
          phone: `${151 + i}${String(Date.now() + i).slice(-8)}`,
          passwordHash: hashPassword(password),
        },
      }),
    ),
  );
  const app = await createApp();
  const provider = app.get(DouyinProvider);
  const providerCalls: string[] = [];
  let subject = "fixture-douyin-subject";
  let apiFailure = false;
  let profileMismatch = false;
  let gate: (() => void) | undefined;
  let waiting: Promise<void> | undefined;
  provider.transport = async (path: string, body: Record<string, string>) => {
    providerCalls.push(path);
    if (apiFailure) throw new DouyinApiError(10010);
    if (path === "/oauth/userinfo/")
      return {
        error_code: 0,
        open_id: profileMismatch ? "wrong-subject" : body.open_id,
        nickname: "真实协议测试账号",
        avatar: "https://p3.douyinpic.com/test.png",
      };
    if (path === "/oauth/access_token/") {
      assert.equal(body.client_key, "integration-client");
      assert.equal(body.client_secret, "integration-secret");
      assert.equal(body.grant_type, "authorization_code");
      return {
        error_code: 0,
        access_token: "act.fixture-secret",
        refresh_token: "rft.fixture-secret",
        open_id: subject,
        scope: "user_info",
        expires_in: 1296000,
        refresh_expires_in: 2592000,
      };
    }
    if (path === "/oauth/refresh_token/") {
      assert.equal(body.grant_type, "refresh_token");
      if (waiting) await waiting;
      return {
        error_code: 0,
        access_token: "act.refreshed-secret",
        refresh_token: "rft.fixture-secret",
        open_id: subject,
        scope: "user_info",
        expires_in: 1296000,
        refresh_expires_in: 2592000,
      };
    }
    throw new Error("Unexpected provider endpoint");
  };
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    csrf = true,
  ) => {
    const res = await fetch(base + "/api/v1" + path, {
      method,
      redirect: "manual",
      headers: {
        Origin: process.env.APP_ORIGIN!,
        "Content-Type": "application/json",
        ...(csrf ? { "X-IMP-Request": "1" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = [303, 204].includes(res.status) ? null : await res.json();
    return { res, data };
  };
  const cookies: string[] = [];
  const begin = async (
    cookie = cookies[0],
    body: unknown = { tier: "brand" },
  ) => {
    const r = await call("/oauth/douyin/start", "POST", body, cookie);
    assert.equal(r.res.status, 201, JSON.stringify(r.data));
    return new URL(r.data.authorizationUrl, process.env.APP_ORIGIN);
  };
  const callback = async (
    state: string,
    code = "fixture-code",
    cookie = cookies[0],
    error?: string,
  ) =>
    call(
      "/oauth/douyin/callback?" +
        new URLSearchParams({ state, code, ...(error ? { error } : {}) }),
      "GET",
      undefined,
      cookie,
    );
  try {
    assert.equal((await call("/oauth/douyin/config")).res.status, 401);
    for (const u of users) {
      const login = await call("/auth/login", "POST", {
        phone: u.phone,
        password,
      });
      assert.equal(login.res.status, 200);
      cookies.push(login.res.headers.get("set-cookie")!.split(";")[0]);
    }
    assert.equal(
      (
        await call(
          "/oauth/douyin/start",
          "POST",
          { tier: "brand" },
          cookies[0],
          false,
        )
      ).res.status,
      403,
    );
    assert.equal(
      (await call("/oauth/douyin/start", "POST", { tier: "brand" }, cookies[2]))
        .res.status,
      403,
    );
    assert.equal(
      (
        await call(
          "/oauth/douyin/start",
          "POST",
          { tier: "brand", mode: "demo" },
          cookies[0],
        )
      ).res.status,
      403,
    );
    assert.equal(
      (
        await call(
          "/oauth/douyin/start",
          "POST",
          { tier: "brand", storeId: "missing" },
          cookies[0],
        )
      ).res.status,
      400,
    );
    const url = await begin();
    const state = url.searchParams.get("state")!;
    assert.equal(url.origin, "https://open.douyin.com");
    assert.equal(url.searchParams.get("scope"), "user_info");
    assert.equal(
      url.searchParams.get("redirect_uri"),
      process.env.DOUYIN_REDIRECT_URI,
    );
    const stored = await db.oAuthState.findUniqueOrThrow({
      where: { id: tokenHash(state) },
    });
    assert.notEqual(stored.id, state);
    const wrongSession = await callback(state, "fixture-code", cookies[1]);
    assert.match(wrongSession.res.headers.get("location")!, /douyin=invalid/);
    const wrongOrg = await callback(state, "fixture-code", cookies[3]);
    assert.match(wrongOrg.res.headers.get("location")!, /douyin=invalid/);
    assert.equal(providerCalls.length, 0);
    const success = await callback(state);
    assert.equal(success.res.status, 303);
    assert.match(success.res.headers.get("location")!, /douyin=connected/);
    assert.equal(await db.oAuthState.count({ where: { id: stored.id } }), 0);
    const replay = await callback(state);
    assert.match(replay.res.headers.get("location")!, /douyin=invalid/);
    assert.equal(providerCalls.length, 2);
    let account = await db.account.findFirstOrThrow({
      where: { organizationId: orgA.id, platform: "douyin" },
    });
    assert.equal(account.accountId, subject);
    assert.equal(account.status, "active");
    const credential = await db.accountAuthorization.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    assert.ok(credential.accessTokenCiphertext?.startsWith("v1."));
    assert.ok(!JSON.stringify(credential).includes("act.fixture-secret"));
    assert.ok(!JSON.stringify(credential).includes("rft.fixture-secret"));
    const list = await call("/accounts", "GET", undefined, cookies[0]);
    assert.equal(list.data.items[0].authorization.mode, "live");
    assert.ok(!JSON.stringify(list.data).includes("Ciphertext"));
    assert.ok(!JSON.stringify(list.data).includes("secret"));
    assert.equal(
      (await call("/accounts", "GET", undefined, cookies[3])).data.total,
      0,
    );
    const tamper = await call(
      `/accounts/${account.id}`,
      "PUT",
      {
        nickname: "alias",
        accountId: "forged",
        platform: "douyin",
        tier: "brand",
      },
      cookies[0],
    );
    assert.equal(tamper.res.status, 400);
    assert.equal(
      (
        await call(
          `/oauth/douyin/accounts/${account.id}/refresh`,
          "POST",
          {},
          cookies[3],
        )
      ).res.status,
      404,
    );
    const oldRefreshExpiry = credential.refreshExpiresAt.getTime();
    assert.equal(
      (
        await call(
          `/oauth/douyin/accounts/${account.id}/refresh`,
          "POST",
          {},
          cookies[0],
        )
      ).res.status,
      201,
    );
    assert.equal(
      (
        await db.accountAuthorization.findUniqueOrThrow({
          where: { accountId: account.id },
        })
      ).refreshExpiresAt.getTime(),
      oldRefreshExpiry,
    );
    // A competing refresh must not send another request with the same refresh_token.
    waiting = new Promise<void>((resolve) => (gate = resolve));
    const before = providerCalls.length;
    const concurrent = call(
      `/oauth/douyin/accounts/${account.id}/refresh`,
      "POST",
      {},
      cookies[0],
    );
    while (providerCalls.length === before)
      await new Promise((r) => setTimeout(r, 5));
    assert.equal(
      (
        await call(
          `/oauth/douyin/accounts/${account.id}/refresh`,
          "POST",
          {},
          cookies[0],
        )
      ).res.status,
      409,
    );
    gate!();
    await concurrent;
    waiting = undefined;
    apiFailure = true;
    assert.equal(
      (
        await call(
          `/oauth/douyin/accounts/${account.id}/refresh`,
          "POST",
          {},
          cookies[0],
        )
      ).res.status,
      400,
    );
    apiFailure = false;
    const revoked = await db.accountAuthorization.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    assert.equal(revoked.accessTokenCiphertext, null);
    assert.equal(revoked.refreshTokenCiphertext, null);
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .status,
      "inactive",
    );
    const reauth = await begin();
    assert.match(
      (await callback(reauth.searchParams.get("state")!)).res.headers.get(
        "location",
      )!,
      /douyin=connected/,
    );
    assert.equal(
      await db.account.count({ where: { organizationId: orgA.id } }),
      1,
    );
    const cross = await begin(cookies[3]);
    assert.match(
      (
        await callback(cross.searchParams.get("state")!, "code", cookies[3])
      ).res.headers.get("location")!,
      /douyin=conflict/,
    );
    const mismatch = await begin(cookies[0], {
      tier: "brand",
      targetAccountId: account.id,
    });
    subject = "different-subject";
    assert.match(
      (await callback(mismatch.searchParams.get("state")!)).res.headers.get(
        "location",
      )!,
      /douyin=conflict/,
    );
    subject = account.accountId;
    const expired = await begin();
    await db.oAuthState.update({
      where: { id: tokenHash(expired.searchParams.get("state")!) },
      data: { expiresAt: new Date(0) },
    });
    const callsBefore = providerCalls.length;
    assert.match(
      (await callback(expired.searchParams.get("state")!)).res.headers.get(
        "location",
      )!,
      /douyin=invalid/,
    );
    assert.equal(providerCalls.length, callsBefore);
    const cancel = await begin();
    assert.match(
      (
        await callback(
          cancel.searchParams.get("state")!,
          "",
          cookies[0],
          "access_denied",
        )
      ).res.headers.get("location")!,
      /douyin=cancelled/,
    );
    assert.equal(providerCalls.length, callsBefore);
    const badProfile = await begin();
    profileMismatch = true;
    assert.match(
      (await callback(badProfile.searchParams.get("state")!)).res.headers.get(
        "location",
      )!,
      /douyin=failed/,
    );
    profileMismatch = false;
    await db.accountAuthorization.update({
      where: { accountId: account.id },
      data: { refreshExpiresAt: new Date(0) },
    });
    assert.equal(
      (
        await call(
          `/oauth/douyin/accounts/${account.id}/refresh`,
          "POST",
          {},
          cookies[0],
        )
      ).res.status,
      400,
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .status,
      "inactive",
    );
    assert.equal(
      (await call(`/accounts/${account.id}`, "DELETE", undefined, cookies[0]))
        .res.status,
      200,
    );
    assert.equal(
      await db.accountAuthorization.count({ where: { accountId: account.id } }),
      0,
    );
    // Demo goes through its own consent endpoint, never the live callback or token API.
    process.env.APP_ORIGIN = "http://localhost:8080";
    const demoConfig = await call(
      "/oauth/douyin/config",
      "GET",
      undefined,
      cookies[0],
    );
    assert.equal(demoConfig.data.demoAvailable, true);
    assert.equal(demoConfig.data.ready, false);
    const demo = await begin(cookies[0], { tier: "store_ip", mode: "demo" });
    const demoState = demo.searchParams.get("state")!;
    const page = await fetch(
      base + "/api/v1/oauth/douyin/demo?state=" + demoState,
      { headers: { Cookie: cookies[0] } },
    );
    assert.match(await page.text(), /非抖音官方授权/);
    assert.ok(
      page.headers
        .get("content-security-policy")
        ?.includes("frame-ancestors 'none'"),
    );
    assert.match(
      (await callback(demoState)).res.headers.get("location")!,
      /douyin=invalid/,
    );
    const demoApproved = await call(
      "/oauth/douyin/demo/confirm",
      "POST",
      { state: demoState, decision: "approve" },
      cookies[0],
    );
    assert.equal(demoApproved.res.status, 201);
    assert.match(demoApproved.data.redirectUrl, /douyin=demo/);
    const demoAccount = await db.account.findFirstOrThrow({
      where: { organizationId: orgA.id },
      include: { authorization: true },
    });
    assert.equal(demoAccount.status, "warning");
    assert.equal(demoAccount.authorization?.mode, "demo");
    assert.equal(demoAccount.authorization?.accessTokenCiphertext, null);
    assert.equal(
      (
        await call(
          "/oauth/douyin/demo/confirm",
          "POST",
          { state: demoState, decision: "approve" },
          cookies[0],
        )
      ).res.status,
      400,
    );
    const demoAgain = await begin(cookies[0], {
      tier: "store_ip",
      mode: "demo",
    });
    const demoCancel = await call(
      "/oauth/douyin/demo/confirm",
      "POST",
      { state: demoAgain.searchParams.get("state"), decision: "cancel" },
      cookies[0],
    );
    assert.match(demoCancel.data.redirectUrl, /douyin=cancelled/);
    assert.equal(
      await db.account.count({ where: { organizationId: orgA.id } }),
      1,
    );
    const expiredSession = await begin(cookies[1], {
      tier: "brand",
      mode: "demo",
    });
    await call("/auth/logout", "POST", {}, cookies[1]);
    assert.equal(
      await db.oAuthState.count({
        where: { id: tokenHash(expiredSession.searchParams.get("state")!) },
      }),
      0,
    );
  } finally {
    await app.close();
    for (const org of [orgA, orgB]) {
      await db.oAuthState.deleteMany({ where: { organizationId: org.id } });
      await db.account.deleteMany({ where: { organizationId: org.id } });
      await db.auditLog.deleteMany({ where: { organizationId: org.id } });
      await db.user.deleteMany({ where: { organizationId: org.id } });
      await db.accessRole.deleteMany({ where: { organizationId: org.id } });
      await db.organization.delete({ where: { id: org.id } });
    }
    await db.$disconnect();
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
