import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";
import { metricSource } from "../dist/oneapi.js";

test("账号区间汇总不因部分缺失而全空，收藏和互动率使用真实快照", async () => {
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: `partial-metrics-${randomUUID()}` },
  });
  const source = metricSource();
  const before = new Date("2026-11-24T15:00:00Z");
  const current = new Date("2026-11-25T16:00:00Z");
  try {
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "区间测试",
        tier: "brand",
      },
    });
    const template = await db.template.create({
      data: {
        organizationId: org.id,
        title: "统计测试模板",
        description: "",
        category: "测试",
      },
    });
    const bindings = [];
    for (const tag of ["测试标签一", "测试标签二"]) {
      bindings.push(
        await db.templateTrackingTag.create({
          data: {
            organizationId: org.id,
            templateId: template.id,
            tag,
            version: "v1",
            titleSnapshot: template.title,
          },
        }),
      );
    }
    for (const [kind, publishedAt] of [
      ["new", "2026-11-25T00:00:00Z"],
      ["missing", "2026-11-01T00:00:00Z"],
      ["partial", "2026-11-25T00:00:00Z"],
    ]) {
      const video = await db.platformVideo.create({
        data: {
          organizationId: org.id,
          accountId: account.id,
          source,
          remoteId: kind,
          title: kind,
          tags: bindings.map((b) => b.tag),
          bindingId: bindings[kind === "new" ? 0 : 1].id,
          matchStatus: "matched",
          publishedAt: new Date(publishedAt),
        },
      });
      await db.videoMetricSample.create({
        data: {
          videoId: video.id,
          source,
          bucket: current,
          capturedAt: current,
          views: kind === "partial" ? null : kind === "new" ? 312n : 9999n,
          likes: kind === "partial" ? 9n : 1n,
          comments: 0n,
          shares: 0n,
          collects: kind === "new" ? 2n : null,
        },
      });
    }
    await db.accountMetricSample.createMany({
      data: [
        {
          accountId: account.id,
          source,
          bucket: before,
          capturedAt: before,
          fans: 100n,
        },
        {
          accountId: account.id,
          source,
          bucket: current,
          capturedAt: current,
          fans: 93n,
        },
      ],
    });
    const service = new DouyinAnalyticsService(db as any, {} as any, {} as any);
    const noBaseline = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "无期初记录",
        tier: "brand",
      },
    });
    await db.accountMetricSample.create({
      data: {
        accountId: noBaseline.id,
        source,
        bucket: current,
        capturedAt: current,
        fans: 25n,
      },
    });
    await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "无任何快照",
        tier: "brand",
      },
    });
    const result = await service.overview(org.id, {
      start: "2026-11-25",
      end: "2026-11-26",
    });
    const row = result.accounts.find((a) => a.id === account.id)!;
    assert.equal(row.metrics.views, 312);
    assert.equal(row.metrics.likes, 10);
    assert.equal(row.metrics.comments, 0);
    assert.equal(row.metrics.collects, 2);
    assert.equal(row.rates.likes, 1 / 312);
    assert.equal(row.rates.collects, 2 / 312);
    assert.equal(row.metricCoverage.views, 1);
    assert.equal(row.metricCoverage.likes, 2);
    assert.equal(row.metricCoverage.total, 3);
    assert.equal(row.netFans, -7);
    assert.equal(
      result.accounts.find((a) => a.id === noBaseline.id)!.netFans,
      null,
    );
    assert.equal(result.summary.netFans, -7);
    assert.equal(result.summary.fans, 118);
    assert.equal(result.summary.views, 312);
    assert.equal(result.summary.rates.likes, 1 / 312);
    assert.equal(result.summary.rates.collects, 2 / 312);
    assert.equal(result.templates.length, 1);
    assert.equal(result.templates[0].metrics.views, 312);
    assert.equal(result.templates[0].metrics.likes, 10);
    assert.equal(result.templates[0].average, 312);
    assert.equal(result.templates[0].videoCount, 3);
    assert.equal(result.templates[0].rates.likes, 1 / 312);
    assert.deepEqual(
      result.content.trend.map((r) => r.date),
      ["2026-11-25", "2026-11-26"],
    );
    const filtered = await service.overview(org.id, {
      start: "2026-11-25",
      end: "2026-11-26",
      accountId: noBaseline.id,
    });
    assert.equal(filtered.summary.views, null);
    assert.equal(filtered.summary.netFans, null);
    assert.equal(filtered.summary.fans, 25);
    assert.equal(filtered.videos.length, 0);
    assert.equal(
      result.videos.find((v) => v.title === "missing")!.metrics.views,
      null,
    );
    assert.equal(
      result.videos.find((v) => v.title === "missing")!.latest!.views,
      9999,
    );
  } finally {
    await db.account.deleteMany({ where: { organizationId: org.id } });
    await db.templateTrackingTag.deleteMany({
      where: { organizationId: org.id },
    });
    await db.template.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  }
});
