import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  videoWindowMetrics,
  accountWindowMetrics,
} from "../dist/douyin-metrics.js";

test("边界统计保留缺失基线、负增量、新视频累计值和租户隔离", async () => {
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: "metrics-window-" + randomUUID() },
  });
  const other = await db.organization.create({
    data: { name: "metrics-other-" + randomUUID() },
  });
  const range = {
    first: new Date("2026-11-01T00:00:00Z"),
    last: new Date("2026-11-02T00:00:00Z"),
  };
  const before = new Date("2026-10-31T23:00:00Z"),
    current = new Date("2026-11-01T12:00:00Z");
  try {
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "测试",
        tier: "brand",
      },
    });
    const foreign = await db.account.create({
      data: {
        organizationId: other.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "其他租户",
        tier: "brand",
      },
    });
    const videos = [];
    for (const kind of ["old", "new", "no-baseline", "stale", "empty"])
      videos.push(
        await db.platformVideo.create({
          data: {
            organizationId: org.id,
            accountId: account.id,
            remoteId: kind,
            title: kind,
            publishedAt:
              kind === "new" ? range.first : new Date("2026-10-01T00:00:00Z"),
          },
        }),
      );
    const sample = (videoId: string, capturedAt: Date, views: bigint) => ({
      videoId,
      bucket: capturedAt,
      capturedAt,
      views,
      likes: views,
      comments: views,
      shares: views,
    });
    await db.videoMetricSample.createMany({
      data: [
        sample(videos[0].id, before, 100n),
        sample(videos[0].id, current, 90n),
        sample(videos[0].id, range.last, 999n),
        sample(videos[1].id, current, 50n),
        sample(videos[2].id, current, 20n),
        sample(videos[3].id, before, 100n),
      ],
    });
    await db.accountMetricSample.createMany({
      data: [
        {
          accountId: account.id,
          bucket: before,
          capturedAt: before,
          fans: 100n,
        },
        {
          accountId: account.id,
          bucket: current,
          capturedAt: current,
          fans: 95n,
        },
        {
          accountId: account.id,
          bucket: range.last,
          capturedAt: range.last,
          fans: 999n,
        },
        {
          accountId: foreign.id,
          bucket: current,
          capturedAt: current,
          fans: 999n,
        },
      ],
    });
    const stats = await videoWindowMetrics(
      db as any,
      org.id,
      videos.map((v) => v.id),
      range,
    );
    assert.equal(stats.size, 5);
    assert.equal(stats.get(videos[0].id)!.views, -10n);
    assert.equal(stats.get(videos[0].id)!.latest_views, 90n);
    assert.equal(stats.get(videos[1].id)!.views, 50n);
    assert.equal(stats.get(videos[2].id)!.views, null);
    assert.equal(stats.get(videos[3].id)!.views, null);
    assert.equal(stats.get(videos[4].id)!.capturedAt, null);
    assert.equal(
      (
        await videoWindowMetrics(
          db as any,
          other.id,
          videos.map((v) => v.id),
          range,
        )
      ).size,
      0,
    );
    const fans = await accountWindowMetrics(
      db as any,
      org.id,
      [account.id, foreign.id],
      range,
    );
    assert.equal(fans.size, 1);
    assert.equal(fans.get(account.id)!.fans, 95n);
    assert.equal(fans.get(account.id)!.netFans, -5n);
    assert.equal(
      (await videoWindowMetrics(db as any, org.id, [], range)).size,
      0,
    );
  } finally {
    await db.account.deleteMany({
      where: { organizationId: { in: [org.id, other.id] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [org.id, other.id] } },
    });
    await db.$disconnect();
  }
});
