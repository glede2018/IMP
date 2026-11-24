import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OneApiDataProvider,
  nextDailySync,
  validDataProfile,
  profileInput,
} from "../dist/oneapi.js";
const secUid = "MS4wLjABAAAA_example_profile";
const stats = {
  watch_cnt: "142165407",
  like_cnt: "2791476",
  comment_cnt: "81350",
  share_cnt: "3574852",
  favorite_cnt: "154935",
};
const video = (n: number) => ({
  aweme_id: String(7584380037021830400n + BigInt(n)),
  create_time: 1765876097,
  desc: "产品介绍 #产品 #人物",
  author: { uid: "63700340656", sec_uid: secUid },
  text_extra: [{ hashtag_name: "产品", type: 1 }],
});
test("OneAPI 每日更新时间采用北京时间并支持跨年", () => {
  assert.equal(
    nextDailySync(new Date("2026-12-31T15:00:00Z")).toISOString(),
    "2026-12-31T16:00:00.000Z",
  );
  assert.equal(
    nextDailySync(new Date("2026-12-31T16:00:00Z")).toISOString(),
    "2027-01-01T16:00:00.000Z",
  );
  assert.equal(validDataProfile(secUid), true);
  for (const value of [
    "http://localhost/profile",
    "https://douyin.com.evil.test/a",
    "https://evil.test/a",
    "https://user@www.douyin.com/a",
    "openid-value",
  ])
    assert.equal(validDataProfile(value), false);
});
test("OneAPI 满20条批量V2，尾页单条V2，精确字符串ID和多个话题", async () => {
  const provider = new OneApiDataProvider();
  const paths: { path: string; body: any }[] = [];
  const rows = Array.from({ length: 20 }, (_, i) => video(i));
  provider.request = async (path, body: any) => {
    paths.push({ path, body });
    if (path === "fetch_user_video_list")
      return {
        aweme_list: body.max_cursor ? [video(20)] : rows,
        has_more: body.max_cursor ? 0 : 1,
        max_cursor: body.max_cursor ? 0 : 1765876097000,
      };
    if (path === "fetch_multiple_video_statistics_v2")
      return {
        items: [...rows].reverse().map((row) => ({
          item_id: row.aweme_id,
          exist: true,
          stats,
          item: { id: row.aweme_id, author_id: "different-xingtu-id" },
        })),
      };
    return { item_id: video(20).aweme_id, exist: true, stats };
  };
  const first = await provider.videos(secUid, "63700340656", "0");
  assert.equal(first.hasMore, true);
  assert.equal(first.videos.length, 20);
  assert.equal(first.videos[0].remoteId, "7584380037021830400");
  assert.deepEqual(first.videos[0].tags, ["产品", "人物"]);
  assert.equal(first.videos[0].metrics?.views, 142165407n);
  assert.equal(first.videos[0].metrics?.collects, 154935n);
  assert.equal(paths[1].body.aweme_ids.length, 20);
  const last = await provider.videos(secUid, "63700340656", first.cursor);
  assert.equal(last.hasMore, false);
  assert.equal(last.cursor, "0");
  assert.equal(paths.at(-1)!.path, "fetch_video_statistics_v2");
});
test("OneAPI 缺失统计不写零、重复游标和其他账号视频拒绝采集", async () => {
  const provider = new OneApiDataProvider();
  provider.request = async (path) =>
    path === "fetch_user_video_list"
      ? { aweme_list: [video(0)], has_more: 0 }
      : { item_id: video(0).aweme_id, exist: false };
  assert.equal(
    (await provider.videos(secUid, "63700340656", "0")).videos[0].metrics,
    null,
  );
  provider.request = async () => ({
    aweme_list: [video(0)],
    has_more: 1,
    max_cursor: 0,
  });
  await assert.rejects(provider.videos(secUid, "63700340656", "0"), /不完整/);
  provider.request = async () => ({ aweme_list: [video(0)], has_more: 0 });
  await assert.rejects(provider.videos(secUid, "another-user", "0"), /不一致/);
});
test("OneAPI 用户粉丝优先抖音总数，网络错误和密钥不进入错误信息", async () => {
  const provider = new OneApiDataProvider();
  provider.request = async () => ({
    user: {
      sec_uid: secUid,
      uid: "63700340656",
      nickname: "测试账号",
      follower_count: 24036501,
      mplatform_followers_count: 24195160,
    },
  });
  assert.equal((await provider.profile(secUid)).fans, 24036501n);
  const original = process.env.ONEAPI_API_KEY;
  const fetcher = globalThis.fetch;
  process.env.ONEAPI_API_KEY = "test-private-key";
  try {
    globalThis.fetch = async () => {
      throw Error("test-private-key sensitive response");
    };
    await assert.rejects(
      new OneApiDataProvider().request("fetch_user_data", {}),
      (error: any) =>
        !error.message.includes("test-private-key") &&
        error.state === "network_error",
    );
  } finally {
    globalThis.fetch = fetcher;
    if (original === undefined) delete process.env.ONEAPI_API_KEY;
    else process.env.ONEAPI_API_KEY = original;
  }
});

test("OneAPI 额外置顶作品去重后按20条拆批，不丢失尾部作品", async () => {
  const provider = new OneApiDataProvider();
  let batch = 0,
    single = 0;
  provider.request = async (path, body: any) => {
    if (path === "fetch_user_video_list")
      return {
        uid: "63700340656",
        aweme_list: [
          ...Array.from({ length: 22 }, (_, i) => video(i)),
          video(0),
        ],
        has_more: 0,
      };
    if (path === "fetch_multiple_video_statistics_v2") {
      batch++;
      return {
        items: body.aweme_ids.map((item_id: string) => ({
          item_id,
          exist: true,
          stats,
        })),
      };
    }
    single++;
    return { item_id: body.aweme_id, exist: true, stats };
  };
  const result = await provider.videos(secUid, "63700340656", "0");
  assert.equal(result.videos.length, 22);
  assert.equal(batch, 1);
  assert.equal(single, 2);
  assert.ok(result.videos.every((v) => v.metrics?.views === 142165407n));
});

test("查询用户支持 sec_uid 或 share_text，拒绝空值和非抖音链接", () => {
  assert.equal(profileInput({}), null);
  assert.equal(
    profileInput({
      sec_uid: "invalid",
      share_text: "https://v.douyin.com/Example/",
    }),
    null,
  );
  assert.equal(
    profileInput({
      sec_uid: secUid,
      share_text: "https://v.douyin.com/Example/",
    }),
    secUid,
  );
  assert.equal(
    profileInput({
      share_text: "我的主页 https://v.douyin.com/Example/ 复制打开抖音",
    }),
    "https://v.douyin.com/Example/",
  );
  assert.equal(
    profileInput({ share_text: "https://v.douyin.com.evil.test/Example/" }),
    null,
  );
  assert.equal(
    profileInput({ share_text: "https://evil.test/Example/" }),
    null,
  );
});

test("采集上限在统计查询之前截断，置顶旧视频不占用最新视频名额", async () => {
  const provider = new OneApiDataProvider();
  const selected: string[] = [];
  provider.request = async (path, body: any) => {
    if (path === "fetch_user_video_list") return {
      aweme_list: Array.from({ length: 25 }, (_, i) => ({ ...video(i), create_time: 1765876097 + i })),
      has_more: 1, max_cursor: 1765876097000,
    };
    selected.push(...body.aweme_ids);
    return { items: body.aweme_ids.map((item_id: string) => ({ item_id, exist: true, stats })) };
  };
  const page = await provider.videos(secUid, "63700340656", "0", 20);
  assert.equal(page.videos.length, 20);
  assert.equal(selected.length, 20);
  assert.equal(selected[0], video(24).aweme_id);
  assert.ok(!selected.includes(video(0).aweme_id));
});
