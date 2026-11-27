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
      const capturedAt = new Date(`2026-11-${day}T00:05:00+08:00`);
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
    const range = {
      first: new Date("2026-11-27T00:00:00+08:00"),
      last: new Date("2026-11-29T00:00:00+08:00"),
    };
    for (const zone of ["UTC", "Asia/Shanghai", "America/New_York"]) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
        assert.deepEqual(
          await videoDailyViews(tx as any, org.id, [video.id], range),
          [
            { date: "2026-11-27", views: 10 },
            { date: "2026-11-28", views: 20 },
          ],
          `趋势统计时区：${zone}`,
        );
        const videos = await videoWindowMetrics(
          tx as any,
          org.id,
          [video.id],
          range,
        );
        assert.equal(
          videos.get(video.id)?.views,
          30n,
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
          30n,
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
