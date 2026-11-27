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
test("OneAPI 全部使用批量V2，尾页一条也批量，精确字符串ID和多个话题", async () => {
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
        items: [...body.aweme_ids].reverse().map((remoteId: string) => ({
          item_id: remoteId,
          exist: true,
          stats,
          item: { id: remoteId, author_id: "different-xingtu-id" },
        })),
      };
    throw new Error("不应调用单视频接口");
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
  assert.equal(paths.at(-1)!.path, "fetch_multiple_video_statistics_v2");
  assert.deepEqual(paths.at(-1)!.body.aweme_ids, [video(20).aweme_id]);
  assert.equal(last.videos[0].metrics?.views, 142165407n);
});
test("OneAPI 缺失统计不写零、重复游标和其他账号视频拒绝采集", async () => {
  const provider = new OneApiDataProvider();
  provider.request = async (path) =>
    path === "fetch_user_video_list"
      ? { aweme_list: [video(0)], has_more: 0 }
      : { items: [{ item_id: video(0).aweme_id, exist: false }] };
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
test("一至二十条视频只调用批量接口，失败不回退单条，空列表不发请求", async () => {
  const provider = new OneApiDataProvider();
  const calls: { path: string; ids: string[] }[] = [];
  provider.request = async (path, body: any) => {
    calls.push({ path, ids: body.aweme_ids });
    assert.equal(path, "fetch_multiple_video_statistics_v2");
    return { items: body.aweme_ids.map((item_id: string) => ({ item_id, stats })) };
  };
  for (const count of [1, 2, 6, 19, 20]) {
    const ids = Array.from({ length: count }, (_, i) => video(i).aweme_id);
    const before = calls.length;
    assert.equal((await provider.statistics(ids)).length, count);
    assert.equal(calls.length, before + 1);
    assert.deepEqual(calls.at(-1)!.ids, ids);
  }
  const before = calls.length;
  await assert.rejects(provider.statistics([]));
  await assert.rejects(provider.statistics(Array.from({ length: 21 }, (_, i) => video(i).aweme_id)));
  assert.equal(calls.length, before);
  const failedPaths: string[] = [];
  provider.request = async path => {
    failedPaths.push(path);
    throw new Error("模拟批量请求失败");
  };
  await assert.rejects(provider.statistics([video(0).aweme_id]), /模拟批量请求失败/);
  assert.deepEqual(failedPaths, ["fetch_multiple_video_statistics_v2"]);
});
test("抖音头像跳过 HEIC 并读取其他尺寸的兼容地址", async () => {
  const provider = new OneApiDataProvider();
  const user = {
    sec_uid: secUid, uid: "63700340656", nickname: "测试账号", follower_count: 1,
    avatar_thumb: { url_list: ["https://p3.douyinpic.com/avatar.heic?from=1", "https://p3.douyinpic.com/avatar.jpeg?from=1"] },
    avatar_medium: { url_list: ["https://p3.douyinpic.com/medium.jpeg"] },
  };
  provider.request = async () => ({ user });
  assert.equal((await provider.profile(secUid)).avatar, "https://p3.douyinpic.com/avatar.jpeg?from=1");
  user.avatar_thumb.url_list = ["https://p3.douyinpic.com/avatar.heic"];
  assert.equal((await provider.profile(secUid)).avatar, "https://p3.douyinpic.com/medium.jpeg");
  user.avatar_medium.url_list = ["javascript:alert(1)"];
  assert.equal((await provider.profile(secUid)).avatar, null);
});
test("抖音缺失粉丝数或单项视频统计时保留空值，不丢弃其他有效数据", async () => {
  const p = new OneApiDataProvider();
  p.request = async () => ({ user: {
    sec_uid: secUid, uid: "63700340656", nickname: "测试账号",
    avatar_thumb: { url_list: ["https://img.example/avatar.jpeg"] },
  } });
  const profile = await p.profile(secUid);
  assert.equal(profile.fans, null);
  assert.equal(profile.avatar, "https://img.example/avatar.jpeg");
  p.request = async (path) => path === "fetch_user_video_list"
    ? { aweme_list: [video(0)], has_more: 0 }
    : { items: [{ item_id: video(0).aweme_id, stats: {
      watch_cnt: null, like_cnt: "12", comment_cnt: "0", share_cnt: "invalid", favorite_cnt: "5",
    } }] };
  const page = await p.videos(secUid, "63700340656", "0");
  assert.deepEqual(page.videos[0].metrics, {
    views: null, likes: 12n, comments: 0n, shares: null, collects: 5n,
  });
  p.request = async (path) => path === "fetch_user_video_list"
    ? { aweme_list: [video(0)], has_more: 0 }
    : { items: [{ item_id: video(0).aweme_id, stats: {} }] };
  assert.equal((await p.videos(secUid, "63700340656", "0")).videos[0].metrics, null);
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
  assert.equal(batch, 2);
  assert.equal(single, 0);
  assert.ok(result.videos.every((v) => v.metrics?.views === 142165407n));
});

test("查询用户支持用户ID 或 share_text，拒绝空值和非抖音链接", () => {
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

test("OneAPI 每次超时30秒，失败重试两次；成功立即结束，最终错误保留类型且不泄漏密钥", async () => {
  const key = process.env.ONEAPI_API_KEY;
  const fetcher = globalThis.fetch;
  const timeout = AbortSignal.timeout;
  const deadlines: number[] = [];
  process.env.ONEAPI_API_KEY = "private-retry-key";
  AbortSignal.timeout = (ms: number) => {
    deadlines.push(ms);
    return new AbortController().signal;
  };
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls < 3) throw Error("private-retry-key");
      return new Response(JSON.stringify({ code: 200, data: { nickname: "测试" } }));
    };
    assert.deepEqual(await new OneApiDataProvider().request("fetch_user_data", {}), { nickname: "测试" });
    assert.equal(calls, 3);
    assert.deepEqual(deadlines, [30000, 30000, 30000]);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ code: 200, data: {} }));
    };
    await new OneApiDataProvider().request("fetch_user_data", {});
    assert.equal(calls, 1);
    for (const [state, response, attempts] of [
      ["platform_error", () => new Response("private-retry-key", { status: 503 }), 3],
      ["quota_exhausted", () => new Response(JSON.stringify({ code: 301, data: null })), 1],
      ["permission_required", () => new Response("private-retry-key", { status: 401 }), 1],
      ["permission_required", () => new Response(JSON.stringify({ code: 403, data: null })), 1],
    ] as const) {
      calls = 0;
      globalThis.fetch = async () => { calls++; return response(); };
      await assert.rejects(new OneApiDataProvider().request("fetch_user_data", {}), (error: any) =>
        error.state === state && error.message.includes("已重试 2 次") === (attempts === 3) && !error.message.includes("private-retry-key"));
      assert.equal(calls, attempts);
    }
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new DOMException("private-retry-key", "TimeoutError"); };
    await assert.rejects(new OneApiDataProvider().request("fetch_user_data", {}), /每次 30 秒，已重试 2 次/);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = fetcher;
    AbortSignal.timeout = timeout;
    if (key === undefined) delete process.env.ONEAPI_API_KEY;
    else process.env.ONEAPI_API_KEY = key;
  }
});

test("抖音满20条批量接口返回直接视频对象，兼容 id/stats 并按精确 ID 匹配乱序结果", async () => {
  const p = new OneApiDataProvider();
  const rows = Array.from({length:20}, (_, i) => video(i));
  p.request = async (path) => path === "fetch_user_video_list"
    ? {aweme_list:rows, has_more:1, max_cursor:1765876097000}
    : {base_resp:{status_code:0},items:[...rows].reverse().map((r,i)=>({id:r.aweme_id,stats:{...stats,watch_cnt:String(100+i)}}))};
  const page = await p.videos(secUid,"63700340656","0",20);
  assert.equal(page.videos.length,20);
  assert.equal(page.videos[0].metrics?.views,119n);
  assert.equal(page.videos[19].metrics?.views,100n);
  assert.ok(page.videos.every(v=>v.metrics?.collects===154935n));
  p.request = async () => ({base_resp:{status_code:1},items:[]});
  await assert.rejects(p.statistics(rows.map(r=>r.aweme_id)),/不完整/);
});
