import { test } from "node:test";
import assert from "node:assert/strict";
import { SocialOneApiProvider } from "../src/social-oneapi.js";
import {
  restoreSocialVideoProgress,
  type SocialVideoProgress,
} from "../src/social-video-progress.js";

test("小红书复用缓存列表，从失败视频继续，并跳过跨页重复详情", async () => {
  let progress: SocialVideoProgress = {
    version: 1,
    platform: "xiaohongshu",
    identity: "uid",
    revision: 1,
    day: "2026-11-27",
    seenIds: [],
    missing: false,
  };
  const saved: string[] = [],
    details: string[] = [];
  let fail = true,
    lists = 0;
  const provider = () => {
    const p = new SocialOneApiProvider();
    p.client.request = async (path, body: any) => {
      if (path === "fetch_user_note_list") {
        lists++;
        return {
          notes: ["1", "2", "3", "1"].map((id) => ({
            id,
            type: "video",
            create_time: 1795508420,
          })),
          has_more: false,
          cursor: "",
        };
      }
      assert.equal(path, "fetch_video_note_detail");
      details.push(body.note_id);
      if (body.note_id === "2" && fail) throw new Error("模拟失败");
      return { id: body.note_id, desc: "视频", liked_count: 1 };
    };
    return p;
  };
  const options = () => ({
    progress,
    onProgress: async (next: SocialVideoProgress, video?: any) => {
      progress = JSON.parse(JSON.stringify(next));
      if (video) saved.push(video.remoteId);
    },
  });
  await assert.rejects(
    provider().videos("xiaohongshu", "uid", "uid", "0", 20, options()),
    /模拟失败/,
  );
  assert.deepEqual(saved, ["1"]);
  fail = false;
  await provider().videos("xiaohongshu", "uid", "uid", "0", 19, options());
  assert.equal(lists, 1);
  assert.deepEqual(details, ["1", "2", "2", "3"]);
  assert.deepEqual(saved, ["1", "2", "3"]);
  assert.equal(progress.page?.rows.length, 0);
});

test("检查点隔离账号身份、版本和采集日", () => {
  const scope = {
    platform: "shipinhao",
    identity: "finder",
    revision: 1,
    day: "2026-11-27",
  };
  const good = { version: 1, ...scope, seenIds: ["1"], missing: false };
  assert.deepEqual(restoreSocialVideoProgress(good, scope), good);
  for (const bad of [
    {},
    { ...good, identity: "other" },
    { ...good, revision: 2 },
    { ...good, day: "2026-11-26" },
    { ...good, seenIds: [1] },
    { ...good, capturedAt: "bad" },
  ]) {
    assert.equal(restoreSocialVideoProgress(bad, scope), null);
  }
});
