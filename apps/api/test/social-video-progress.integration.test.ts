import "../load-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DouyinAnalyticsService } from "../dist/douyin-analytics.js";
import {
  DataProviderError,
  shanghaiDate,
} from "../dist/douyin-data-provider.js";

// 所有供应商调用均由模拟响应替代，不访问收费接口。
for (const platform of ["xiaohongshu", "shipinhao", "kuaishou"] as const) {
  test(`${platform} 保存单条和列表检查点，重启仅继续失败位置，次日重新采集`, async () => {
    const savedEnv = { ...process.env };
    Object.assign(process.env, {
      DOUYIN_DATA_PROVIDER: "oneapi",
      ONEAPI_API_KEY: "mock",
      ONEAPI_VIDEO_SYNC_LIMIT: "20",
    });
    const db = new PrismaClient();
    const org = await db.organization.create({
      data: { name: `checkpoint-${randomUUID()}` },
    });
    try {
      const uid =
        platform === "xiaohongshu"
          ? "67767bba000000001801cd2d"
          : platform === "shipinhao"
            ? "v2_test@finder"
            : "123456";
      const account = await db.account.create({
        data: {
          organizationId: org.id,
          platform,
          accountId: randomUUID(),
          nickname: "断点测试",
          tier: "brand",
          dataProvider: "oneapi",
          dataProfile: uid,
          dataUid: uid,
          dataSecUid: uid,
        },
      });
      const state = await db.douyinSyncState.create({
        data: { accountId: account.id, kind: "videos", status: "queued" },
      });
      let fail = true,
        lists = 0;
      const details: string[] = [];
      const rows = ["a", "b", "c"].map((suffix, i) => {
        const id = String(100 - i);
        const base = {
          create_time: 1795508420 - i,
          title: suffix,
          username: uid,
          like_count: 3,
          comment_count: 2,
          forward_count: 1,
          fav_count: 4,
        };
        return platform === "xiaohongshu"
          ? { id, type: "video", create_time: base.create_time }
          : platform === "shipinhao"
            ? { ...base, id: i === 1 && fail ? "" : id }
            : {
                ...base,
                photo_id: i === 1 && fail ? "" : id,
                timestamp: base.create_time,
                caption: suffix,
                user_id: uid,
              };
      });
      const service = () => {
        const instance = new DouyinAnalyticsService(
          db as any,
          {} as any,
          {} as any,
        );
        (instance as any).social.client.request = async (
          path: string,
          body: any,
        ) => {
          if (path === "fetch_video_note_detail") {
            details.push(body.note_id);
            if (body.note_id === "99" && fail)
              throw new DataProviderError("quota_exhausted", "余额不足");
            return {
              id: body.note_id,
              desc: "测试",
              liked_count: 3,
              comments_count: 2,
              collected_count: 4,
            };
          }
          lists++;
          if (platform === "xiaohongshu")
            return { notes: rows, has_more: false, cursor: "" };
          if (platform === "shipinhao")
            return {
              username: uid,
              videos: rows,
              up_continue: 0,
              last_buffer: "",
            };
          return { feeds: rows, pcursor: "no_more" };
        };
        return instance;
      };
      await service().run(state.id);
      let snapshot = await db.douyinSyncState.findUniqueOrThrow({
        where: { id: state.id },
      });
      assert.equal(snapshot.processed, 1);
      assert.equal(
        await db.platformVideo.count({ where: { accountId: account.id } }),
        1,
      );
      assert.equal((snapshot.videoProgress as any).page.rows.length, 2);
      assert.deepEqual((snapshot.videoProgress as any).seenIds, ["100"]);
      assert.notEqual(snapshot.status, "success");
      assert.equal(lists, 1);
      fail = false;
      // 列表已缓存：此处修复模拟坏行，重试不应重新获取整页。
      const checkpoint: any = snapshot.videoProgress;
      if (platform !== "xiaohongshu") {
        checkpoint.page.rows[0][platform === "shipinhao" ? "id" : "photo_id"] =
          "99";
      }
      await db.douyinSyncState.update({
        where: { id: state.id },
        data: { nextAttemptAt: new Date(0), videoProgress: checkpoint },
      });
      await service().run(state.id);
      snapshot = await db.douyinSyncState.findUniqueOrThrow({
        where: { id: state.id },
      });
      assert.equal(snapshot.status, "success");
      assert.equal(snapshot.processed, 3);
      assert.deepEqual(snapshot.videoProgress, {});
      assert.equal(lists, 1);
      assert.equal(
        await db.platformVideo.count({ where: { accountId: account.id } }),
        3,
      );
      assert.equal(
        await db.videoMetricSample.count({
          where: { video: { accountId: account.id } },
        }),
        3,
      );
      if (platform === "xiaohongshu")
        assert.deepEqual(details, ["100", "99", "99", "98"]);
      else assert.deepEqual(details, []);
      // 昨天未完成的检查点不能影响今天的新一轮。
      await db.douyinSyncState.update({
        where: { id: state.id },
        data: {
          nextAttemptAt: new Date(0),
          processed: 20,
          videoProgress: {
            version: 1,
            platform,
            identity: uid,
            revision: account.dataRevision,
            day: shanghaiDate(new Date(Date.now() - 86400000)),
            seenIds: ["100"],
            missing: false,
          },
        },
      });
      rows[1][
        platform === "shipinhao"
          ? "id"
          : platform === "kuaishou"
            ? "photo_id"
            : "id"
      ] = "99";
      await service().run(state.id);
      snapshot = await db.douyinSyncState.findUniqueOrThrow({
        where: { id: state.id },
      });
      assert.equal(snapshot.processed, 3);
      assert.equal(lists, 2);
      assert.equal(snapshot.status, "success");
    } finally {
      await db.account.deleteMany({ where: { organizationId: org.id } });
      await db.organization.delete({ where: { id: org.id } });
      await db.$disconnect();
      for (const name of [
        "DOUYIN_DATA_PROVIDER",
        "ONEAPI_API_KEY",
        "ONEAPI_VIDEO_SYNC_LIMIT",
      ]) {
        if (savedEnv[name] === undefined) delete process.env[name];
        else process.env[name] = savedEnv[name];
      }
    }
  });
}

test("视频号翻页失败保留游标，只补剩余数量；已完成检查点不重复请求", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    DOUYIN_DATA_PROVIDER: "oneapi",
    ONEAPI_API_KEY: "mock",
    ONEAPI_VIDEO_SYNC_LIMIT: "20",
  });
  const db = new PrismaClient();
  const org = await db.organization.create({
    data: { name: `page-resume-${randomUUID()}` },
  });
  try {
    const uid = "v2_test@finder";
    const account = await db.account.create({
      data: {
        organizationId: org.id,
        platform: "shipinhao",
        accountId: randomUUID(),
        nickname: "翻页测试",
        tier: "brand",
        dataProvider: "oneapi",
        dataProfile: uid,
        dataUid: uid,
        dataSecUid: uid,
      },
    });
    const state = await db.douyinSyncState.create({
      data: { accountId: account.id, kind: "videos", status: "queued" },
    });
    let fail = true;
    const cursors: string[] = [];
    const service = () => {
      const instance = new DouyinAnalyticsService(
        db as any,
        {} as any,
        {} as any,
      );
      (instance as any).social.client.request = async (
        path: string,
        body: any,
      ) => {
        assert.equal(path, "fetch_user_video_list");
        cursors.push(body.last_buffer);
        if (body.last_buffer && fail)
          throw new DataProviderError("network_error", "模拟第二页超时", true);
        const start = body.last_buffer ? 10 : 0;
        return {
          username: uid,
          up_continue: 1,
          last_buffer: body.last_buffer ? "page3" : "page2",
          videos: Array.from({ length: 12 }, (_, i) => ({
            id: String(100 - start - i),
            username: uid,
            title: "视频",
            create_time: 1795508420 - start - i,
            like_count: 1,
          })),
        };
      };
      return instance;
    };
    await service().run(state.id);
    let snapshot = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(snapshot.processed, 12);
    assert.equal(snapshot.cursor, "page2");
    fail = false;
    await db.douyinSyncState.update({
      where: { id: state.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await service().run(state.id);
    snapshot = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(snapshot.status, "success");
    assert.equal(snapshot.processed, 20);
    assert.deepEqual(cursors, ["", "page2", "page2"]);
    assert.equal(
      await db.platformVideo.count({ where: { accountId: account.id } }),
      20,
    );
    // 模拟最后一页已提交、最终状态落库前进程退出。
    await db.douyinSyncState.update({
      where: { id: state.id },
      data: {
        nextAttemptAt: new Date(0),
        processed: 1,
        videoProgress: {
          version: 1,
          platform: "shipinhao",
          identity: uid,
          revision: account.dataRevision,
          day: shanghaiDate(new Date()),
          seenIds: ["100"],
          missing: false,
          complete: true,
        },
      },
    });
    await service().run(state.id);
    assert.equal(cursors.length, 3);
    snapshot = await db.douyinSyncState.findUniqueOrThrow({
      where: { id: state.id },
    });
    assert.equal(snapshot.status, "success");
    assert.deepEqual(snapshot.videoProgress, {});
  } finally {
    await db.account.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
    for (const name of [
      "DOUYIN_DATA_PROVIDER",
      "ONEAPI_API_KEY",
      "ONEAPI_VIDEO_SYNC_LIMIT",
    ]) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
