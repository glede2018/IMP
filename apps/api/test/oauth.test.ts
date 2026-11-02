import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "../src/oauth-crypto.js";
import {
  DouyinProvider,
  DouyinApiError,
  douyinConfig,
} from "../src/douyin-provider.js";

test("OAuth tokens use authenticated encryption bound to the account and token purpose", () => {
  const previous = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const context = "douyin:key:subject:access";
    const value = "private-access-token";
    const encrypted = encryptToken(value, context);
    assert.notEqual(encrypted, encryptToken(value, context));
    assert.ok(!encrypted.includes(value));
    assert.equal(decryptToken(encrypted, context), value);
    assert.throws(() => decryptToken(encrypted, "douyin:key:other:access"));
    assert.throws(() => decryptToken(encrypted, "douyin:key:subject:refresh"));
    const parts = encrypted.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    assert.throws(() => decryptToken(parts.join("."), context));
  } finally {
    if (previous === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = previous;
  }
});
test("live OAuth requires HTTPS and same-origin callback; demo is blocked on public origins", () => {
  const names = [
    "APP_ORIGIN",
    "DOUYIN_CLIENT_KEY",
    "DOUYIN_CLIENT_SECRET",
    "DOUYIN_REDIRECT_URI",
    "DOUYIN_SCOPES",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "DOUYIN_DEMO_ENABLED",
  ];
  const previous = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    Object.assign(process.env, {
      APP_ORIGIN: "https://imp.example.test",
      DOUYIN_CLIENT_KEY: "key",
      DOUYIN_CLIENT_SECRET: "secret",
      DOUYIN_REDIRECT_URI:
        "https://imp.example.test/api/v1/oauth/douyin/callback",
      DOUYIN_SCOPES: "user_info",
      OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      DOUYIN_DEMO_ENABLED: "true",
    });
    assert.equal(douyinConfig().ready, true);
    assert.equal(douyinConfig().demoAvailable, false);
    process.env.DOUYIN_REDIRECT_URI =
      "https://other.example.test/api/v1/oauth/douyin/callback";
    assert.equal(douyinConfig().ready, false);
    process.env.APP_ORIGIN = "http://localhost:8080";
    assert.equal(douyinConfig().demoAvailable, true);
    process.env.DOUYIN_REDIRECT_URI =
      "http://localhost:8080/api/v1/oauth/douyin/callback";
    assert.equal(douyinConfig().ready, false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
test("provider uses official POST encodings, catches HTTP-200 API failures, and never surfaces upstream secrets", async () => {
  const originalFetch = globalThis.fetch;
  const provider = new DouyinProvider();
  const calls: { url: string; init: RequestInit }[] = [];
  let response: unknown = {
    data: { error_code: 0, open_id: "subject", nickname: "Verified nickname" },
  };
  globalThis.fetch = (async (input: unknown, init: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(response), { status: 200 });
  }) as typeof fetch;
  try {
    await provider.profile("private-access-token", "subject");
    assert.equal(calls[0].url, "https://open.douyin.com/oauth/userinfo/");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
      "application/json",
    );
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      access_token: "private-access-token",
      open_id: "subject",
    });
    response = {
      data: {
        error_code: 10010,
        description: "private-access-token leaked upstream",
      },
    };
    await assert.rejects(
      provider.transport("/oauth/refresh_token/", {
        refresh_token: "private-refresh-token",
      }),
      (e) =>
        e instanceof DouyinApiError &&
        e.invalidAuthorization &&
        !e.message.includes("private"),
    );
    assert.equal(
      (calls[1].init.headers as Record<string, string>)["Content-Type"],
      "application/x-www-form-urlencoded",
    );
    assert.ok(calls[1].init.body instanceof URLSearchParams);
    response = {
      data: { error_code: 0, open_id: "wrong", nickname: "Wrong user" },
    };
    await assert.rejects(provider.profile("private-access-token", "subject"));
    assert.throws(() =>
      provider.parseToken({
        access_token: "act",
        refresh_token: "rft",
        open_id: "subject",
        expires_in: 100,
        refresh_expires_in: 200,
        scope: "other",
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
