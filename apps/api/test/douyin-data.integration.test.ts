import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { encryptToken } from "../src/oauth-crypto.js";
import { fixtureAccess } from "./access-fixture.js";
const { createApp } = await import("../dist/app.js");
const { DouyinAnalyticsService } = await import("../dist/douyin-analytics.js");
const { DouyinDataProvider, DataProviderError, shanghaiDate } =
  await import("../dist/douyin-data-provider.js");
const { DouyinService } = await import("../dist/douyin.js");
test("Douyin data: live pipeline, tenant/role isolation, immutable tags, snapshots, cooldown and lease/revision safety", async () => {
  const envNames = [
    "APP_ORIGIN",
    "DOUYIN_CLIENT_KEY",
    "DOUYIN_CLIENT_SECRET",
    "DOUYIN_REDIRECT_URI",
    "DOUYIN_SCOPES",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "DOUYIN_VIDEO_API_PROFILE",
    "DOUYIN_FANS_SYNC_ENABLED",
  ];
  const previous = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    APP_ORIGIN: "https://analytics.example.test",
    DOUYIN_CLIENT_KEY: "test-data-key",
    DOUYIN_CLIENT_SECRET: "test-secret",
    DOUYIN_REDIRECT_URI:
      "https://analytics.example.test/api/v1/oauth/douyin/callback",
    DOUYIN_SCOPES: "user_info",
    OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DOUYIN_VIDEO_API_PROFILE: "website_v1",
    DOUYIN_FANS_SYNC_ENABLED: "true",
  });
  const db = new PrismaClient();
  const app = await createApp();
  const service = app.get(DouyinAnalyticsService);
  service.onModuleDestroy();
  app.get(DouyinService).onModuleDestroy();
  const source = app.get(DouyinDataProvider);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const org = await db.organization.create({
    data: { name: "analytics-" + randomUUID() },
  });
  const other = await db.organization.create({
    data: { name: "analytics-other-" + randomUUID() },
  });
  const password = "only-test-password";
  const admin = await db.user.create({
    data: {
      phone: "171" + String(Date.now()).slice(-8),
      name: "Analytics admin",
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("admin", org.id),
    },
  });
  const viewer = await db.user.create({
    data: {
      phone: "172" + String(Date.now()).slice(-8),
      name: "Analytics viewer",
      passwordHash: hashPassword(password),
      organizationId: org.id,
      ...fixtureAccess("viewer", org.id),
    },
  });
  const makeAccount = (organizationId: string, accountId: string) =>
    db.account.create({
      data: {
        organizationId,
        platform: "douyin",
        nickname: "Synced account",
        accountId,
        tier: "personal_ip",
        status: "active",
      },
    });
  const account = await makeAccount(org.id, "subject-" + randomUUID()),
    foreign = await makeAccount(other.id, "foreign-" + randomUUID());
  const now = new Date();
  const published = new Date(now.getTime() - 3 * 86400000);
  const yesterday = new Date(now.getTime() - 86400000);
  const date = shanghaiDate(now);
  const template = await db.template.create({
    data: {
      organizationId: org.id,
      title: "Template A",
      description: "test",
      category: "new_product",
    },
  });
  const authData = {
    mode: "live",
    clientKey: "test-data-key",
    openId: account.accountId,
    scopes: [
      "user_info",
      "video.list.bind",
      "video.data.bind",
      "fans.data.bind",
    ],
    accessTokenCiphertext: encryptToken(
      "never-return-access-token",
      `douyin:test-data-key:${account.accountId}:access`,
    ),
    refreshTokenCiphertext: encryptToken(
      "never-return-refresh-token",
      `douyin:test-data-key:${account.accountId}:refresh`,
    ),
    accessExpiresAt: new Date(Date.now() + 7 * 86400000),
    refreshExpiresAt: new Date(Date.now() + 30 * 86400000),
    lastVerifiedAt: now,
  };
  await db.accountAuthorization.create({
    data: { accountId: account.id, ...authData },
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
        Origin: process.env.APP_ORIGIN!,
        "Content-Type": "application/json",
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
  let reads = 0;
  source.videos = async () => {
    reads++;
    return {
      videos: [
        {
          remoteId: "@opaque-video-id",
          title: "测试视频 #产品v1",
          publishedAt: published,
          tags: ["产品v1", "产品别名", "新品", "探店"],
          metrics: { views: 150n, likes: 10n, comments: 2n, shares: 1n },
        },
      ],
      hasMore: false,
      cursor: "0",
    };
  };
  source.fans = async () => 120n;
  const ready = async (kind: string) => {
    await db.douyinSyncState.updateMany({
      where: { accountId: account.id, kind },
      data: { nextAttemptAt: null, leaseUntil: null },
    });
    return db.douyinSyncState.findUniqueOrThrow({
      where: { accountId_kind: { accountId: account.id, kind } },
    });
  };
  try {
    assert.equal((await call("/analytics/douyin/status")).status, 401);
    const cookie = (
      await call("/auth/login", "POST", { account: admin.username, password })
    ).cookie!;
    const viewerCookie = (
      await call("/auth/login", "POST", { account: viewer.username, password })
    ).cookie!;
    assert.equal(
      (
        await call(
          `/analytics/douyin/accounts/${account.id}/sync`,
          "POST",
          {},
          viewerCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/analytics/douyin/accounts/${foreign.id}/sync`,
          "POST",
          {},
          cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/analytics/douyin/tags",
          "POST",
          { templateId: template.id, tag: "#产品v1", version: "v1" },
          viewerCookie,
        )
      ).status,
      403,
    );
    const binding = await call(
      "/analytics/douyin/tags",
      "POST",
      { templateId: template.id, tag: "#产品v1", version: "v1" },
      cookie,
    );
    assert.equal(binding.status, 201);
    const alias = await call(
      "/analytics/douyin/tags",
      "POST",
      { templateId: template.id, tag: "产品别名", version: "v1" },
      cookie,
    );
    assert.equal(alias.status, 201);
    assert.equal(
      (
        await call(
          "/analytics/douyin/tags",
          "POST",
          { templateId: template.id, tag: "产品v1", version: "v2" },
          cookie,
        )
      ).status,
      409,
    );
    await call(
      `/analytics/douyin/accounts/${account.id}/sync`,
      "POST",
      {},
      cookie,
    );
    const videoState = await ready("videos"),
      fanState = await ready("fans");
    await service.run(videoState.id);
    await service.run(fanState.id);
    let status = await call(
      "/analytics/douyin/status",
      "GET",
      undefined,
      cookie,
    );
    assert.equal(status.data.length, 1);
    assert.ok(status.data[0].states.every((s: any) => s.status === "success"));
    assert.ok(!JSON.stringify(status.data).includes("never-return"));
    const video = await db.platformVideo.findFirstOrThrow({
      where: { accountId: account.id },
    });
    assert.ok([binding.data.id, alias.data.id].includes(video.bindingId));
    assert.equal(video.matchStatus, "matched");
    let overview = await call(
      `/analytics/douyin/overview?start=${date}&end=${date}`,
      "GET",
      undefined,
      cookie,
    );
    assert.equal(overview.status, 200);
    assert.equal(overview.data.templates.length, 1);
    assert.equal(overview.data.summary.views, null);
    assert.equal(overview.data.summary.netFans, null);
    assert.equal(overview.data.summary.fans, 120);
    assert.ok(!JSON.stringify(overview.data).includes("never-return"));
    assert.equal(overview.data.summary.measuredVideos, 0);
    // Existing videos require an actual prior-day baseline; the first current observation never invents zero history.
    await db.videoMetricSample.create({
      data: {
        videoId: video.id,
        bucket: yesterday,
        capturedAt: yesterday,
        views: 100n,
        likes: 8n,
        comments: 1n,
        shares: 1n,
      },
    });
    await db.accountMetricSample.create({
      data: {
        accountId: account.id,
        bucket: yesterday,
        capturedAt: yesterday,
        fans: 100n,
      },
    });
    overview = await call(
      `/analytics/douyin/overview?start=${date}&end=${date}`,
      "GET",
      undefined,
      cookie,
    );
    assert.equal(overview.data.summary.views, 50);
    assert.equal(overview.data.summary.netFans, 20);
    assert.equal(overview.data.templates[0].metrics.views, 50);
    assert.equal(
      (
        await call(
          `/analytics/douyin/overview?start=${date}&end=${date}&accountId=${foreign.id}`,
          "GET",
          undefined,
          cookie,
        )
      ).data.videos.length,
      0,
    );
    const before = reads;
    await call(
      `/analytics/douyin/accounts/${account.id}/sync`,
      "POST",
      {},
      cookie,
    );
    await service.run(videoState.id);
    assert.equal(reads, before);
    await ready("videos");
    await service.run(videoState.id);
    assert.equal(
      await db.platformVideo.count({ where: { accountId: account.id } }),
      1,
    );
    assert.equal(
      await db.videoMetricSample.count({ where: { videoId: video.id } }),
      2,
    );
    // Only one collector wins the lease across concurrent workers.
    await ready("videos");
    const oldReads = reads;
    await Promise.all([service.run(videoState.id), service.run(videoState.id)]);
    assert.equal(reads, oldReads + 1);
    // Mid-flight reauthorization must prevent writing stale data.
    await ready("videos");
    source.videos = async () => {
      await db.accountAuthorization.update({
        where: { accountId: account.id },
        data: { revision: { increment: 1 } },
      });
      return {
        videos: [
          {
            remoteId: "stale-video",
            title: "stale",
            publishedAt: published,
            tags: [],
            metrics: null,
          },
        ],
        hasMore: false,
        cursor: "0",
      };
    };
    await service.run(videoState.id);
    assert.equal(
      await db.platformVideo.count({ where: { remoteId: "stale-video" } }),
      0,
    );
    assert.equal(
      (
        await db.douyinSyncState.findUniqueOrThrow({
          where: { id: videoState.id },
        })
      ).status,
      "authorization_required",
    );
    await ready("videos");
    source.videos = async () => {
      throw new DataProviderError("unsupported", "接口已下线");
    };
    await service.run(videoState.id);
    assert.equal(
      (
        await db.douyinSyncState.findUniqueOrThrow({
          where: { id: videoState.id },
        })
      ).status,
      "unsupported",
    );
    assert.equal(
      await db.platformVideo.count({ where: { accountId: account.id } }),
      1,
    );
    await db.accountAuthorization.update({
      where: { accountId: account.id },
      data: { mode: "demo" },
    });
    const blocked = await call(
      `/analytics/douyin/accounts/${account.id}/sync`,
      "POST",
      {},
      cookie,
    );
    assert.ok(blocked.data[0].states.every((s: any) => s.status === "blocked"));
  } finally {
    await app.close();
    await db.account.deleteMany({
      where: { organizationId: { in: [org.id, other.id] } },
    });
    await db.templateTrackingTag.deleteMany({
      where: { organizationId: org.id },
    });
    await db.template.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({
      where: { organizationId: { in: [org.id, other.id] } },
    });
    await db.accessRole.deleteMany({
      where: { organizationId: { in: [org.id, other.id] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [org.id, other.id] } },
    });
    await db.$disconnect();
    for (const key of envNames) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
