import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
import { createApp } from "../dist/app.js";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";
import { SocialOneApiProvider } from "../dist/social-oneapi.js";
import { DataProviderError } from "../dist/douyin-data-provider.js";

test("四平台 OneAPI 独立绑定：无需 OAuth、预览确认、初始化、身份隔离、零点采集和空指标", async () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    DOUYIN_DATA_PROVIDER: "oneapi",
    ONEAPI_API_KEY: "mock-key",
    OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DOUYIN_CLIENT_KEY: "",
    DOUYIN_CLIENT_SECRET: "",
    APP_ORIGIN: "http://localhost:5173",
  });
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: "social-" + randomUUID() },
  });
  const foreign = await db.organization.create({
    data: { name: "foreign-" + randomUUID() },
  });
  const password = "Social-test-password-2026";
  const createUser = (role: string, organizationId: string, prefix: string) =>
    db.user.create({
      data: {
        organizationId,
        name: role,
        phone: prefix + String(Date.now()).slice(-8),
        passwordHash: hashPassword(password),
        ...fixtureAccess(role, organizationId),
      },
    });
  const admin = await createUser("admin", org.id, "171");
  const viewer = await createUser("viewer", org.id, "172");
  const outsider = await createUser("admin", foreign.id, "173");
  const originalProfile = SocialOneApiProvider.prototype.profile,
    originalVideos = SocialOneApiProvider.prototype.videos;
  const identifiers = {
    douyin: "MS4wLjABAAAA_example_profile",
    xiaohongshu: "67767bba000000001801cd2d",
    kuaishou: "1589037969",
    shipinhao: "v2_1234567890_example@finder",
  };
  let calls = 0,
    quota = false;
  SocialOneApiProvider.prototype.profile = async (platform) => {
    calls++;
    const uid = identifiers[platform];
    return {
      uid,
      secUid: uid,
      nickname: platform + "测试",
      avatar: "https://img.example/avatar.png",
      fans: platform === "shipinhao" ? null : 23n,
    };
  };
  SocialOneApiProvider.prototype.videos = async (platform) => {
    calls++;
    if (quota) throw new DataProviderError("quota_exhausted", "余额不足");
    return {
      videos: [
        {
          remoteId: "same-video-id",
          title: "视频 #新品",
          coverUrl: "https://img.example/video-cover.jpg",
          publishedAt: new Date(Date.now() - 1000),
          tags: ["新品"],
          metrics: {
            views: platform === "xiaohongshu" ? null : 100n,
            likes: 2n,
            comments: 1n,
            shares: null,
            collects: 10n,
          },
        },
      ],
      hasMore: false,
      cursor: "0",
    };
  };
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const headers = {
    "Content-Type": "application/json",
    "X-IMP-Request": "1",
    Origin: "http://localhost:5173",
  };
  const login = async (phone: string) => {
    const r = await fetch(base + "/api/v1/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, password }),
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const request = (
    path: string,
    cookie: string,
    body?: any,
    method = body ? "POST" : "GET",
  ) =>
    fetch(base + "/api/v1" + path, {
      method,
      headers: { ...headers, cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const cookie = await login(admin.phone),
      read = await login(viewer.phone),
      other = await login(outsider.phone);
    const service = app.get(DouyinAnalyticsService),
      initialize = service.initializeAccount.bind(service);
    const queued: string[] = [];
    service.initializeAccount = async (id) => {
      queued.push(id);
    };
    assert.equal(
      (
        await request("/accounts/profile/preview", read, {
          platform: "kuaishou",
          user_id: identifiers.kuaishou,
        })
      ).status,
      403,
    );
    assert.equal(calls, 0);
    const officialStart = await request("/oauth/douyin/start", cookie, {
      mode: "live",
      tier: "brand",
    });
    assert.equal(officialStart.status, 400);
    assert.match((await officialStart.json()).message, /OneAPI/);
    assert.equal(
      (
        await request("/accounts", cookie, {
          platform: "kuaishou",
          nickname: "未验证",
          accountId: "12345678",
          tier: "brand",
        })
      ).status,
      400,
    );
    const accountIds: string[] = [];
    for (const [platform, user_id] of Object.entries(identifiers)) {
      const response = await request("/accounts/profile/preview", cookie, {
        platform,
        user_id,
      });
      assert.equal(response.status, 201);
      const preview = await response.json();
      assert.equal(preview.nickname, platform + "测试");
      assert.equal(
        await db.account.count({ where: { organizationId: org.id, platform } }),
        0,
      );
      assert.equal(
        (
          await request("/accounts/profile/bind", cookie, {
            confirmationToken: preview.confirmationToken + "bad",
            tier: "brand",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/accounts/profile/bind", other, {
            confirmationToken: preview.confirmationToken,
            tier: "brand",
          })
        ).status,
        400,
      );
      const confirmed = await request("/accounts/profile/bind", cookie, {
        confirmationToken: preview.confirmationToken,
        tier: "personal_ip",
      });
      assert.equal(confirmed.status, 201);
      const account = await confirmed.json();
      assert.equal(account.dataProvider, "oneapi");
      assert.equal(account.status, "active");
      assert.equal(account.authorization, undefined);
      accountIds.push(account.id);
      const before = calls;
      assert.equal(
        (
          await request("/accounts/profile/bind", cookie, {
            confirmationToken: preview.confirmationToken,
            tier: "personal_ip",
          })
        ).status,
        201,
      );
      assert.equal(calls, before);
      assert.equal(queued.filter((id) => id === account.id).length, 1);
      assert.equal(
        await db.accountAuthorization.count({
          where: { accountId: account.id },
        }),
        0,
      );
      await initialize(account.id);
      const states = await db.douyinSyncState.findMany({
        where: { accountId: account.id },
      });
      assert.equal(states.length, 2);
      assert.ok(
        states.every(
          (s) =>
            s.status === "success" && s.nextAttemptAt!.getUTCHours() === 16,
        ),
      );
    }
    assert.equal(
      await db.platformVideo.count({ where: { organizationId: org.id } }),
      4,
    );
    const list = await (await request("/accounts", cookie)).json();
    assert.equal(
      list.items.find((a: any) => a.platform === "shipinhao").fans,
      null,
    );
    const overview = await (
      await request("/analytics/social/overview", cookie)
    ).json();
    assert.equal(overview.videos.length, 4);
    assert.equal(
      overview.videos[0].coverUrl,
      "https://img.example/video-cover.jpg",
    );
    assert.equal(overview.videos[0].latest.collects, 10);
    assert.equal(overview.accounts.length, 4);
    const filtered = await (
      await request("/analytics/social/overview?platform=xiaohongshu", cookie)
    ).json();
    assert.equal(filtered.accounts.length, 1);
    assert.equal(filtered.accounts[0].platform, "xiaohongshu");
    assert.equal(filtered.videos[0].latest.views, null);
    assert.equal(filtered.videos[0].latest.likes, 2);
    assert.equal(
      (await (await request("/analytics/social/overview", other)).json()).videos
        .length,
      0,
    );
    const badTarget = await request("/accounts/profile/preview", other, {
      platform: "douyin",
      user_id: identifiers.douyin,
      accountId: accountIds[0],
    });
    assert.equal(badTarget.status, 404);
    const original = await db.account.findUniqueOrThrow({
      where: { id: accountIds[0] },
    });
    const metadata = await request(
      `/accounts/${original.id}`,
      cookie,
      {
        nickname: "changed",
        platform: "kuaishou",
        accountId: original.accountId,
        tier: "brand",
      },
      "PUT",
    );
    assert.equal(metadata.status, 400);
    // 上游仍有历史分页时，达到本轮上限也必须结束，次日重新从最新页开始。
    const savedLimit = process.env.ONEAPI_VIDEO_SYNC_LIMIT;
    process.env.ONEAPI_VIDEO_SYNC_LIMIT = "2";
    const normalVideos = SocialOneApiProvider.prototype.videos;
    let listCalls = 0;
    SocialOneApiProvider.prototype.videos = async () => {
      listCalls++;
      return {
        videos: Array.from({ length: 3 }, (_, i) => ({
          remoteId: `limited-${i}`,
          title: `视频${i}`,
          tags: [],
          publishedAt: new Date(Date.now() - i * 1000),
          metrics: { views: 5n, likes: 1n, comments: 0n, shares: 0n },
        })),
        hasMore: true,
        cursor: "older-page",
      };
    };
    try {
      const videoState = await db.douyinSyncState.findUniqueOrThrow({
        where: { accountId_kind: { accountId: accountIds[0], kind: "videos" } },
      });
      for (let run = 0; run < 2; run++) {
        await db.douyinSyncState.update({
          where: { id: videoState.id },
          data: { nextAttemptAt: null },
        });
        await service.run(videoState.id);
        const completed = await db.douyinSyncState.findUniqueOrThrow({
          where: { id: videoState.id },
        });
        assert.equal(completed.processed, 2);
        assert.equal(completed.cursor, "0");
        assert.equal(completed.status, "success");
        assert.equal(completed.nextAttemptAt!.getUTCHours(), 16);
      }
      assert.equal(listCalls, 2);
      assert.equal(
        await db.platformVideo.count({
          where: { accountId: accountIds[0], remoteId: "limited-2" },
        }),
        0,
      );
      assert.equal(
        await db.platformVideo.count({
          where: { accountId: accountIds[0], remoteId: "same-video-id" },
        }),
        1,
      );
    } finally {
      SocialOneApiProvider.prototype.videos = normalVideos;
      if (savedLimit === undefined) delete process.env.ONEAPI_VIDEO_SYNC_LIMIT;
      else process.env.ONEAPI_VIDEO_SYNC_LIMIT = savedLimit;
    }
    quota = true;
    const state = await db.douyinSyncState.findUniqueOrThrow({
      where: { accountId_kind: { accountId: accountIds[2], kind: "videos" } },
    });
    await db.douyinSyncState.update({
      where: { id: state.id },
      data: { nextAttemptAt: null },
    });
    await service.run(state.id);
    const failed = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(failed.status, "quota_exhausted");
    assert.equal(failed.nextAttemptAt!.getUTCHours(), 16);
    assert.ok(failed.nextAttemptAt! > new Date());
    const beforeTick = calls;
    const recover = service.recoverLegacyRetries.bind(service);
    service.recoverLegacyRetries = (now) => recover(now, org.id);
    await service.tick();
    assert.equal(calls, beforeTick);
  } finally {
    await app.close();
    SocialOneApiProvider.prototype.profile = originalProfile;
    SocialOneApiProvider.prototype.videos = originalVideos;
    for (const organizationId of [org.id, foreign.id]) {
      await db.auditLog.deleteMany({ where: { organizationId } });
      await db.account.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { organizationId } });
      await db.accessRole.deleteMany({ where: { organizationId } });
      await db.organization.delete({ where: { id: organizationId } });
    }
    await db.$disconnect();
    process.env = env;
  }
});
