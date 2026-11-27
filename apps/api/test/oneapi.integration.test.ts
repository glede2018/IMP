import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
import { fixtureAccess } from "./access-fixture.js";
import { createApp } from "../dist/app.js";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";
import { OneApiDataProvider } from "../dist/oneapi.js";
import { videoWindowMetrics, videoDailyViews } from "../dist/douyin-metrics.js";

test("OneAPI 同步扫码授权账号：权限和组织隔离、零点计划、来源隔离及余额不足", async () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    DOUYIN_DATA_PROVIDER: "oneapi",
    ONEAPI_API_KEY: "mock-key",
    OAUTH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: "http://localhost:5173",
  });
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: "oneapi-" + randomUUID() },
  });
  const password = "Oneapi-test-password-2026";
  const admin = await db.user.create({
    data: {
      name: "测试管理员",
      phone: "181" + String(Date.now()).slice(-8),
      organizationId: org.id,
      passwordHash: hashPassword(password),
      ...fixtureAccess("admin", org.id),
    },
  });
  const viewer = await db.user.create({
    data: {
      name: "只读",
      phone: "182" + String(Date.now()).slice(-8),
      organizationId: org.id,
      passwordHash: hashPassword(password),
      ...fixtureAccess("viewer", org.id),
    },
  });
  const original = OneApiDataProvider.prototype.request;
  const secUid = "MS4wLjABAAAA_example_profile";
  let quota = false;
  let calls = 0;
  OneApiDataProvider.prototype.request = async (path) => {
    calls++;
    if (path === "fetch_user_data")
      return {
        user: {
          uid: "63700340656",
          sec_uid: secUid,
          nickname: "采集测试",
          follower_count: 24036501,
        },
      };
    if (path === "fetch_user_video_list")
      return {
        aweme_list: [
          {
            aweme_id: "7584380037021830400",
            desc: "产品 #烘焙 #新品",
            create_time: Math.floor(Date.now() / 1000) - 86400,
            author: { uid: "63700340656", sec_uid: secUid },
          },
        ],
        has_more: 0,
        max_cursor: 0,
      };
    if (quota) {
      const { DataProviderError } =
        await import("../dist/douyin-data-provider.js");
      throw new DataProviderError(
        "quota_exhausted",
        "OneAPI 余额不足，请充值后手动重新同步。",
      );
    }
    if (path !== "fetch_multiple_video_statistics_v2") throw new Error("不应调用单视频接口");
    return { items: [{
      item_id: "7584380037021830400",
      exist: true,
      stats: {
        watch_cnt: "1000",
        like_cnt: "100",
        comment_cnt: "10",
        share_cnt: "5",
        favorite_cnt: "3",
      },
    }] };
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
  const request = (path: string, cookie: string, method = "GET", body?: any) =>
    fetch(base + "/api/v1" + path, {
      method,
      headers: { ...headers, cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const cookie = await login(admin.phone);
    const readonly = await login(viewer.phone);
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: "oauth-open-id",
        nickname: "已扫码账号",
        tier: "brand",
        status: "active",
      },
    });
    assert.equal(
      (
        await request(
          `/accounts/${account.id}/data-profile/preview`,
          readonly,
          "POST",
          {
            sec_uid: secUid,
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/accounts/${account.id}/data-profile/preview`,
          cookie,
          "POST",
          {
            sec_uid: secUid,
          },
        )
      ).status,
      400,
    );
    assert.equal(calls, 0);
    await db.accountAuthorization.create({
      data: {
        accountId: account.id,
        mode: "live",
        clientKey: "test",
        openId: account.accountId,
        scopes: ["user_info"],
        accessTokenCiphertext: "encrypted-test-only",
        refreshTokenCiphertext: "encrypted-test-only",
        accessExpiresAt: new Date(Date.now() + 86400000),
        refreshExpiresAt: new Date(Date.now() + 86400000),
        lastVerifiedAt: new Date(),
      },
    });
    assert.equal(
      (
        await request(
          `/accounts/${account.id}/data-profile/preview`,
          cookie,
          "POST",
          {},
        )
      ).status,
      400,
    );
    const previewResponse = await request(
      `/accounts/${account.id}/data-profile/preview`,
      cookie,
      "POST",
      { sec_uid: secUid, share_text: "" },
    );
    assert.equal(previewResponse.status, 201);
    const preview = await previewResponse.json();
    assert.equal(preview.nickname, "采集测试");
    const pending = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert.equal(pending.dataSecUid, null);
    assert.equal(pending.nickname, "已扫码账号");
    assert.equal(
      (
        await request(`/accounts/${account.id}/data-profile`, cookie, "PUT", {
          confirmationToken: preview.confirmationToken + "tampered",
        })
      ).status,
      400,
    );
    const service = app.get(DouyinAnalyticsService);
    const initialize = service.initializeAccount.bind(service);
    const initialized: string[] = [];
    service.initializeAccount = async (id) => {
      initialized.push(id);
    };
    const callsBeforeConfirmation = calls;
    const confirmed = await request(
      `/accounts/${account.id}/data-profile`,
      cookie,
      "PUT",
      { confirmationToken: preview.confirmationToken },
    );
    assert.equal(confirmed.status, 200);
    const updated = await confirmed.json();
    assert.equal(updated.nickname, preview.nickname);
    assert.equal(updated.dataSecUid, secUid);
    assert.equal(updated.authorization, undefined);
    assert.equal(calls, callsBeforeConfirmation);
    assert.deepEqual(initialized, [account.id]);
    const initialStates = await db.douyinSyncState.findMany({
      where: { accountId: account.id },
    });
    assert.deepEqual(initialStates.map((s) => s.kind).sort(), [
      "fans",
      "videos",
    ]);
    assert.ok(
      initialStates.every(
        (s) => s.status === "queued" && s.nextAttemptAt === null,
      ),
    );
    const unchanged = await (
      await request(`/accounts/${account.id}/data-profile`, cookie, "PUT", {
        confirmationToken: preview.confirmationToken,
      })
    ).json();
    assert.equal(unchanged.authorization, undefined);
    assert.deepEqual(initialized, [account.id]);
    assert.deepEqual(
      await db.douyinSyncState.findMany({
        where: { accountId: account.id },
      }),
      initialStates,
    );
    assert.equal(
      (
        await request(
          "/accounts/not-this-organization/data-profile",
          cookie,
          "PUT",
          { confirmationToken: preview.confirmationToken },
        )
      ).status,
      404,
    );
    const sharePreview = await request(
      `/accounts/${account.id}/data-profile/preview`,
      cookie,
      "POST",
      {
        share_text:
          "这是我的主页 https://v.douyin.com/Example/ 复制此链接打开抖音",
      },
    );
    assert.equal(sharePreview.status, 201);
    assert.equal(
      (
        await request("/accounts/douyin-profile", cookie, "POST", {
          dataProfile: secUid,
          tier: "brand",
        })
      ).status,
      404,
    );
    service.initializeAccount = initialize;
    await service.initializeAccount(account.id);
    const states = await db.douyinSyncState.findMany({
      where: { accountId: account.id },
    });
    assert.ok(states.every((s) => s.status === "success"), JSON.stringify(states.map(({status,message})=>({status,message}))));
    assert.ok(states.every((s) => s.nextAttemptAt!.getUTCHours() === 16));
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .accountId,
      "oauth-open-id",
    );
    const list = await (await request("/accounts", cookie)).json();
    assert.equal(list.items[0].fans, 24036501);
    const video = await db.platformVideo.findFirstOrThrow({
      where: { accountId: account.id },
    });
    assert.deepEqual(video.tags, ["烘焙", "新品"]);
    const sample = await db.videoMetricSample.findFirstOrThrow({
      where: { videoId: video.id },
    });
    assert.equal(sample.views, 1000n);
    assert.equal(sample.collects, 3n);
    assert.equal(sample.source, "oneapi_v2");
    // 官方历史值不能充当 OneAPI 的期初基线。
    const before = new Date(Date.now() - 2 * 86400000);
    await db.videoMetricSample.create({
      data: {
        videoId: video.id,
        bucket: before,
        capturedAt: before,
        source: "official",
        views: 999n,
        likes: 99n,
        comments: 9n,
        shares: 4n,
      },
    });
    const windows = await videoWindowMetrics(db as any, org.id, [video.id], {
      first: new Date(Date.now() - 3600000),
      last: new Date(Date.now() + 3600000),
    });
    assert.equal(windows.get(video.id)!.views, null);
    const today = new Date(
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) +
        "T00:00:00+08:00",
    );
    const dailyRange = {
      first: today,
      last: new Date(today.getTime() + 86400000),
    };
    const daily = await videoDailyViews(
      db as any,
      org.id,
      [video.id],
      dailyRange,
    );
    assert.equal(daily.length, 1);
    assert.equal(daily[0].views, null);
    await db.videoMetricSample.update({
      where: { videoId_bucket: { videoId: video.id, bucket: before } },
      data: { source: "oneapi_v2", views: 900n },
    });
    assert.equal(
      (await videoDailyViews(db as any, org.id, [video.id], dailyRange))[0]
        .views,
      100,
    );
    const overview = await service.overview(org.id, {});
    assert.equal(overview.content.generated, 0);
    assert.equal(overview.content.publishedWorks, null);
    assert.ok(overview.content.trend.length > 0);
    assert.equal(
      overview.accounts.find((a) => a.id === account.id)?.fans,
      24036501,
    );

    const videoState = states.find((s) => s.kind === "videos")!;
    const previousCalls = calls;
    await service.enqueue(org.id, account.id);
    await service.run(videoState.id);
    assert.equal(calls, previousCalls);
    quota = true;
    await db.douyinSyncState.update({
      where: { id: videoState.id },
      data: { nextAttemptAt: null },
    });
    await service.run(videoState.id);
    const failed = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: videoState.id },
    });
    assert.equal(failed.status, "quota_exhausted");
    assert.equal(failed.nextAttemptAt!.getUTCHours(), 16);
    assert.equal(
      (
        await db.videoMetricSample.findUniqueOrThrow({
          where: { id: sample.id },
        })
      ).views,
      1000n,
    );
    await db.accountAuthorization.update({
      where: { accountId: account.id },
      data: { refreshExpiresAt: new Date(Date.now() - 1000) },
    });
    const beforeBlocked = calls;
    await service.enqueue(org.id, account.id);
    await service.run(videoState.id);
    assert.equal(calls, beforeBlocked);
    assert.equal(
      (
        await db.douyinSyncState.findUniqueOrThrow({
          where: { id: videoState.id },
        })
      ).status,
      "blocked",
    );
  } finally {
    await app.close();
    OneApiDataProvider.prototype.request = original;
    await db.auditLog.deleteMany({ where: { organizationId: org.id } });
    await db.account.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.accessRole.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
    process.env = env;
  }
});
