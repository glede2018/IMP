import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";

test("自动发现分页覆盖第一百零一个账号，完成一轮后继续发现后续账号", async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, {
    APP_ORIGIN: "https://discovery.example.test",
    DOUYIN_CLIENT_KEY: "test-key",
    DOUYIN_CLIENT_SECRET: "test-secret",
    DOUYIN_REDIRECT_URI:
      "https://discovery.example.test/api/v1/oauth/douyin/callback",
    DOUYIN_SCOPES: "user_info",
    OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DOUYIN_VIDEO_API_PROFILE: "website_v1",
  });
  const accounts = Array.from({ length: 101 }, (_, index) => ({
    id: "account-" + String(index).padStart(4, "0"),
    authorization: {
      mode: "live",
      clientKey: "test-key",
      scopes: ["user_info"],
      refreshExpiresAt: new Date(Date.now() + 86400000),
      accessTokenCiphertext: "test",
      refreshTokenCiphertext: "test",
    },
  }));
  const queued = new Set<string>();
  const batchSizes: number[] = [];
  const db = {
    account: {
      findMany: async (query: any) => {
        const rows = accounts
          .filter(
            (account) => !query.where.id || account.id > query.where.id.gt,
          )
          .slice(0, query.take);
        batchSizes.push(rows.length);
        return rows;
      },
    },
    douyinSyncState: {
      upsert: async (query: any) => {
        queued.add(query.create.accountId + ":" + query.create.kind);
      },
      findMany: async () => [],
    },
  };
  const service = new DouyinAnalyticsService(
    db as any,
    { availability: () => "" } as any,
    {} as any,
  );
  try {
    await service.tick();
    await service.tick();
    assert.ok(queued.has("account-0100:videos"));
    assert.ok(queued.has("account-0100:fans"));
    assert.equal(queued.size, 202);
    assert.deepEqual(batchSizes, [100, 1]);
    accounts.unshift({ ...accounts[0], id: "account-new-before-cursor" });
    // 新账号会在后续扫描中被发现，已存在的队列不重复创建。
    accounts.sort((a, b) => a.id.localeCompare(b.id));
    await service.tick();
    await service.tick();
    assert.equal(queued.size, 204);
  } finally {
    process.env = originalEnv;
  }
});
