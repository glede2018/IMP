import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  videoDailyViews,
  videoWindowMetrics,
  accountWindowMetrics,
} from "../dist/douyin-metrics.js";

test("北京时间零点采集的趋势和边界增量不受数据库会话时区影响", async () => {
  const oldProvider = process.env.DOUYIN_DATA_PROVIDER;
  process.env.DOUYIN_DATA_PROVIDER = "official";
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: `timezone-${randomUUID()}` },
  });
  try {
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "时区测试",
        tier: "brand",
      },
    });
    const video = await db.platformVideo.create({
      data: {
        organizationId: org.id,
        accountId: account.id,
        remoteId: "timezone-video",
        title: "视频",
        publishedAt: new Date("2026-11-01T00:00:00+08:00"),
      },
    });
    for (const [day, value] of [
      [26, 100],
      [27, 110],
      [28, 130],
    ] as const) {
      const capturedAt = new Date(
        `2026-11-${day}T00:${day === 28 ? "00" : "05"}:00+08:00`,
      );
      await db.videoMetricSample.create({
        data: {
          videoId: video.id,
          bucket: capturedAt,
          capturedAt,
          views: BigInt(value),
        },
      });
      await db.accountMetricSample.create({
        data: {
          accountId: account.id,
          bucket: capturedAt,
          capturedAt,
          fans: BigInt(value),
        },
      });
    }
    // 同轮延迟补采仍归入 27 日，取最后一次累计值，不重复累加快照。
    const retryAt = new Date("2026-11-28T02:30:00+08:00");
    await db.videoMetricSample.create({
      data: {
        videoId: video.id,
        bucket: retryAt,
        capturedAt: retryAt,
        views: 140n,
      },
    });
    await db.accountMetricSample.create({
      data: {
        accountId: account.id,
        bucket: retryAt,
        capturedAt: retryAt,
        fans: 140n,
      },
    });
    const range = {
      first: new Date("2026-11-26T00:00:00+08:00"),
      last: new Date("2026-11-28T00:00:00+08:00"),
    };
    for (const zone of ["UTC", "Asia/Shanghai", "America/New_York"]) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
        assert.deepEqual(
          await videoDailyViews(tx as any, org.id, [video.id], range),
          [
            { date: "2026-11-26", views: 10 },
            { date: "2026-11-27", views: 30 },
          ],
          `趋势统计时区：${zone}`,
        );
        const yesterday = {
          first: new Date("2026-11-27T00:00:00+08:00"),
          last: new Date("2026-11-28T00:00:00+08:00"),
        };
        assert.deepEqual(
          await videoDailyViews(tx as any, org.id, [video.id], yesterday),
          [{ date: "2026-11-27", views: 30 }],
        );
        assert.equal(
          (
            await videoWindowMetrics(tx as any, org.id, [video.id], yesterday)
          ).get(video.id)?.views,
          30n,
        );
        assert.equal(
          (
            await accountWindowMetrics(
              tx as any,
              org.id,
              [account.id],
              yesterday,
            )
          ).get(account.id)?.netFans,
          30n,
        );
        const today = {
          first: yesterday.last,
          last: new Date("2026-11-29T00:00:00+08:00"),
        };
        assert.deepEqual(
          await videoDailyViews(tx as any, org.id, [video.id], today),
          [{ date: "2026-11-28", views: null }],
        );
        const videos = await videoWindowMetrics(
          tx as any,
          org.id,
          [video.id],
          range,
        );
        assert.equal(
          videos.get(video.id)?.views,
          40n,
          `视频区间统计时区：${zone}`,
        );
        const accounts = await accountWindowMetrics(
          tx as any,
          org.id,
          [account.id],
          range,
        );
        assert.equal(
          accounts.get(account.id)?.netFans,
          40n,
          `粉丝区间统计时区：${zone}`,
        );
      });
    }
  } finally {
    await db.account.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
    if (oldProvider === undefined) delete process.env.DOUYIN_DATA_PROVIDER;
    else process.env.DOUYIN_DATA_PROVIDER = oldProvider;
  }
});
