import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";
import { DataProviderError } from "../dist/douyin-data-provider.js";
import { nextDailySync } from "../dist/oneapi.js";

test("每日任务临时失败持久化补偿计划，重启后成功执行才恢复完成状态", async () => {
  const names = ["DOUYIN_DATA_PROVIDER", "ONEAPI_API_KEY"];
  const previous = names.map((name) => process.env[name]);
  Object.assign(process.env, {
    DOUYIN_DATA_PROVIDER: "oneapi",
    ONEAPI_API_KEY: "mock-unused-key",
  });
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: `retry-${randomUUID()}` },
  });
  try {
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "douyin",
        accountId: randomUUID(),
        nickname: "补偿测试",
        tier: "brand",
        dataProvider: "oneapi",
        dataProfile: "MS4wLjABAAAA_test",
        dataSecUid: "MS4wLjABAAAA_test",
        dataUid: "123456",
      },
    });
    const state = await db.douyinSyncState.create({
      data: { accountId: account.id, kind: "videos", status: "queued" },
    });
    const service = new DouyinAnalyticsService(db as any, {} as any, {} as any);
    (service as any).social.videos = async () => {
      throw new DataProviderError("network_error", "模拟超时", true);
    };
    const before = Date.now();
    await service.run(state.id);
    const failed = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(failed.status, "network_error");
    assert.equal(failed.failures, 1);
    assert.equal(failed.lastSuccessAt, null);
    assert.equal(failed.leaseUntil, null);
    assert.ok(failed.nextAttemptAt!.getTime() > before);
    assert.ok(failed.nextAttemptAt!.getTime() <= Date.now() + 60000);
    // 模拟进程重启：尚未到补偿时间时不执行，到期后复用数据库计划继续。
    const restarted = new DouyinAnalyticsService(
      db as any,
      {} as any,
      {} as any,
    );
    const legacyNext = nextDailySync();
    await db.douyinSyncState.update({
      where: { id: state.id },
      data: { nextAttemptAt: legacyNext },
    });
    await restarted.recoverLegacyRetries(new Date(), org.id);
    const recovered = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    // 旧版本排至次日的失败，在新版本启动时纳入当天补偿，不用手工改数据库。
    if (legacyNext.getTime() - Date.now() > 60000) {
      assert.ok(recovered.nextAttemptAt! < legacyNext);
    }
    let calls = 0;
    (restarted as any).social.videos = async () => {
      calls++;
      return { videos: [], hasMore: false, cursor: "0" };
    };
    await restarted.run(state.id);
    assert.equal(calls, 0);
    await db.douyinSyncState.update({
      where: { id: state.id },
      data: { nextAttemptAt: new Date(Date.now() - 1) },
    });
    await restarted.run(state.id);
    const completed = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(calls, 1);
    assert.equal(completed.status, "success");
    assert.equal(completed.failures, 0);
    assert.ok(completed.lastSuccessAt);
    assert.equal(completed.nextAttemptAt!.getUTCHours(), 16);
    assert.equal(completed.leaseUntil, null);
  } finally {
    await db.account.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
