import { test } from "node:test";
import assert from "node:assert/strict";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";

test("单账号任务抛异常不阻断其他账号，下一轮扫描仍可执行", async () => {
  const names = [
    "DOUYIN_DATA_PROVIDER",
    "DOUYIN_FANS_SYNC_ENABLED",
    "DOUYIN_VIDEO_API_PROFILE",
  ];
  const previous = names.map((name) => process.env[name]);
  Object.assign(process.env, {
    DOUYIN_DATA_PROVIDER: "official",
    DOUYIN_FANS_SYNC_ENABLED: "false",
    DOUYIN_VIDEO_API_PROFILE: "disabled",
  });
  const calls: string[] = [];
  const service = new DouyinAnalyticsService(
    {
      douyinSyncState: {
        findMany: async () => [{ id: "failed" }, { id: "healthy" }],
      },
    } as any,
    {} as any,
    {} as any,
  );
  service.run = async (id) => {
    calls.push(id);
    if (id === "failed") throw new Error("模拟任务持久化失败");
  };
  try {
    await service.tick();
    await service.tick();
    assert.deepEqual(calls, ["failed", "healthy", "failed", "healthy"]);
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
