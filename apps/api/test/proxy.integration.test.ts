import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/app.js";
import { Database } from "../dist/database.js";

test("反向代理下不同客户端独立限流，同一客户端伪造更早的转发头不能绕过限制", async () => {
  const previous = process.env.TRUSTED_PROXY_CIDRS;
  process.env.TRUSTED_PROXY_CIDRS = "loopback,uniquelocal";
  const app = await createApp();
  const db = app.get(Database);
  const originalQuery = db.user.findUnique;
  db.user.findUnique = async () => null;
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try {
    const trust = app.getHttpAdapter().getInstance().get("trust proxy fn");
    assert.equal(trust("203.0.113.1", 0), false);
    assert.equal(trust("172.18.0.2", 0), true);
    const login = async (forwarded: string) => {
      const response = await fetch(base + "/api/v1/auth/login", {
        method: "POST",
        headers: {
          Origin: process.env.APP_ORIGIN!,
          "Content-Type": "application/json",
          "X-IMP-Request": "1",
          "X-Forwarded-For": forwarded,
        },
        body: JSON.stringify({
          account: "nonexistent-review-account",
          password: "invalid",
        }),
      });
      await response.arrayBuffer();
      return response.status;
    };
    for (let i = 1; i <= 12; i++)
      assert.equal(await login(`203.0.113.${i}, 172.18.0.1`), 401);
    for (let i = 0; i < 9; i++)
      assert.equal(
        await login(`198.51.100.${i}, 203.0.113.1, 172.18.0.1`),
        401,
      );
    assert.equal(await login("198.51.100.99, 203.0.113.1, 172.18.0.1"), 429);
    assert.equal(await login("203.0.113.50, 172.18.0.1"), 401);
  } finally {
    db.user.findUnique = originalQuery;
    await app.close();
    if (previous === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
    else process.env.TRUSTED_PROXY_CIDRS = previous;
  }
});
