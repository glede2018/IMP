import { videoCoverUrl, wechatVideoCoverUrl } from "../src/video-cover.js";
import { parseOneApiVideo } from "../src/oneapi.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SocialOneApiProvider,
  socialProfileInput,
  nullableCount,
} from "../src/social-oneapi.js";
import { parseOneApiJson } from "../src/oneapi.js";
const xhs = "67767bba000000001801cd2d",
  finder = "v2_1234567890_example@finder";
test("视频号参数异常只显示简短提示，不暴露平台调试信息", async () => {
  const p = new SocialOneApiProvider();
  let calls = 0;
  const error = {
    message: "请求参数可能有误，请检查参数后重试。",
    empty_reason: "bad_input", debug_id: "c47ebd6b", debug_info: "opaque-debug-data",
  };
  for (const response of [error, { code: 200, data: error }]) {
    p.client.request = async () => { calls++; return response; };
    await assert.rejects(p.profile("shipinhao", "sphSiligcZ1lm2i"), (e: Error) => {
      assert.equal(e.message, "参数异常");
      return true;
    });
  }
  assert.equal(calls, 2);
  p.client.request = async () => error;
  await assert.rejects(p.videos("shipinhao", finder, finder, "0"), /^Error: 参数异常$/);
});
test("多平台输入隔离，ID 优先于分享文案，视频号只接受可解析的账号身份", () => {
  assert.equal(
    socialProfileInput("xiaohongshu", {
      share_text: "我的主页 https://xhslink.com/a/abc123 复制打开",
    }),
    "https://xhslink.com/a/abc123",
  );
  assert.equal(
    socialProfileInput("xiaohongshu", {
      user_id: xhs,
      share_text: "https://evil.test",
    }),
    xhs,
  );
  assert.equal(
    socialProfileInput("kuaishou", { user_id: "1589037969" }),
    "1589037969",
  );
  assert.equal(
    socialProfileInput("shipinhao", { user_id: "sphilT1fCLWHKd7" }),
    "sphilT1fCLWHKd7",
  );
  assert.equal(
    socialProfileInput("shipinhao", {
      share_text: `https://channels.weixin.qq.com/profile?username=${finder}`,
    }),
    finder,
  );
  for (const platform of ["xiaohongshu", "kuaishou", "shipinhao"] as const) {
    assert.equal(
      socialProfileInput(platform, { share_text: "https://v.douyin.com/abc/" }),
      null,
    );
    assert.equal(
      socialProfileInput(platform, {
        share_text: "https://xhslink.com.evil.test/path",
      }),
      null,
    );
    assert.equal(
      socialProfileInput(platform, {
        user_id: "!!!",
        share_text: "https://v.kuaishou.com/abc",
      }),
      null,
    );
  }
  assert.equal(
    socialProfileInput("shipinhao", {
      share_text: "https://weixin.qq.com/sph/AbCd123",
    }),
    "https://weixin.qq.com/sph/AbCd123",
  );
});
test("超长数字 ID 使用原始文本，不能转成有损的 JS 数字；未知统计保留为空", () => {
  const value = parseOneApiJson(
    '{"photo_id":5193213434377443123,"user_id":1589037969,"views":null}',
  );
  assert.equal(value.photo_id, "5193213434377443123");
  assert.equal(value.user_id, 1589037969);
  assert.equal(nullableCount(null), null);
  assert.equal(nullableCount("1.2万"), null);
  assert.equal(nullableCount(0), 0n);
});
test("快手解析真实 userProfile 嵌套结构，并用数字身份采集及校验所有者", async () => {
  const p = new SocialOneApiProvider();
  let paths: string[] = [];
  p.client.request = async (path, body: any, namespace) => {
    paths.push(path);
    assert.equal(namespace, "kuaishou");
    if (path === "fetch_user_data")
      return {
        result: 1,
        userProfile: {
          profile: {
            user_id: 1589037969,
            eid: "3x27bmjkcvidfne",
            user_name: "测试快手",
            headurl: "https://img.example/avatar.jpg",
          },
          ownerCount: { fan: 23 },
        },
      };
    assert.equal(body.user_id, "1589037969");
    assert.equal(body.pcursor, "");
    return {
      result: 1,
      pcursor: "no_more",
      feeds: [
        {
          photo_id: "5193213434377443123",
          user_id: 1589037969,
          caption: "商品 #新品",
          timestamp: 1795508420000,
          view_count: 10,
          like_count: 2,
          comment_count: 1,
        },
      ],
    };
  };
  const user = await p.profile("kuaishou", "3x27bmjkcvidfne");
  assert.equal(user.uid, "1589037969");
  assert.equal(user.fans, 23n);
  const page = await p.videos("kuaishou", user.secUid, user.uid, "0");
  assert.equal(page.hasMore, false);
  assert.equal(page.videos[0].remoteId, "5193213434377443123");
  assert.equal(page.videos[0].metrics?.shares, null);
  assert.deepEqual(page.videos[0].tags, ["新品"]);
  assert.deepEqual(paths, ["fetch_user_data", "fetch_user_video_list_v3"]);
  assert.throws(() =>
    p.parseVideo(
      "kuaishou",
      { user_id: 123, photo_id: "1", timestamp: 1795508420000 },
      user.uid,
    ),
  );
});
test("视频号 sph 转 finder，只用主页接口取用户资料，支持不透明游标", async () => {
  const p = new SocialOneApiProvider();
  p.client.request = async (path, body: any, ns) => {
    assert.equal(ns, "wechat-channels-v2");
    if (path === "fetch_channel_id_to_username") return { username: finder };
    assert.equal(body.username, finder);
    if (path === "fetch_home_page")
      return {
        username: finder,
        nickname: "测试视频号",
        head_url: "https://img.example/head.png",
        fans_count: 0,
      };
    return {
      username: finder,
      up_continue: 1,
      last_buffer: "abc+/==",
      videos: [
        {
          id: "15061816303522749687",
          username: finder,
          title: "产品 #新品",
          create_time: 1795508420,
          read_count: 10,
          like_count: 0,
          forward_count: 2,
          comment_count: 1,
          fav_count: 3,
        },
      ],
    };
  };
  const user = await p.profile("shipinhao", "sphilT1fCLWHKd7");
  assert.equal(user.uid, finder);
  assert.equal(user.fans, 0n);
  const page = await p.videos("shipinhao", finder, finder, "0");
  assert.equal(page.cursor, "abc+/==");
  assert.equal(page.videos[0].metrics?.collects, 3n);
  await assert.rejects(
    p.videos("shipinhao", finder, finder, "abc+/=="),
    /不完整/,
  );
});
test("小红书忽略图文但仍按完整列表翻页，详情中的话题和统计合并且不虚构播放量", async () => {
  const p = new SocialOneApiProvider();
  let detailCalls = 0;
  p.client.request = async (path) => {
    if (path === "fetch_user_data")
      return {
        code: 0,
        success: true,
        data: {
          userid: xhs,
          nickname: "测试小红书",
          images: "https://img.example/xhs.jpg",
          fans: 10,
        },
      };
    if (path === "fetch_user_note_list")
      return {
        code: 0,
        success: true,
        data: {
          notes: [
            {
              id: "video1",
              type: "video",
              create_time: 1795508420,
              title: "短标题",
              user: { userid: xhs },
              likes: 1,
            },
            { id: "picture2", type: "normal", cursor: "last-picture" },
          ],
          has_more: true,
        },
      };
    detailCalls++;
    return {
      code: 0,
      success: true,
      data: [
        {
          id: "video1",
          user: { userid: xhs },
          desc: "完整文案 #新品",
          hash_tag: [{ name: "烘焙" }],
          liked_count: 3,
          comments_count: 2,
          shared_count: 1,
          collected_count: 4,
        },
      ],
    };
  };
  const user = await p.profile("xiaohongshu", xhs);
  assert.equal(user.fans, 10n);
  const page = await p.videos("xiaohongshu", xhs, xhs, "0");
  assert.equal(page.cursor, "last-picture");
  assert.equal(page.videos.length, 1);
  assert.equal(detailCalls, 1);
  assert.deepEqual(page.videos[0].tags, ["烘焙", "新品"]);
  assert.equal(page.videos[0].title, "完整文案 #新品");
  assert.equal(page.videos[0].metrics?.views, null);
  assert.equal(page.videos[0].metrics?.likes, 3n);
});

test("四个平台封面解析及不安全地址过滤，快手 CDN 自动升级 HTTPS", () => {
  const p = new SocialOneApiProvider();
  assert.equal(parseOneApiVideo({aweme_id: "123", desc: "视频", create_time: 1765876097, video: {cover: {url_list: ["https://img.example/dy.jpg"]}}}, "1", "sec").coverUrl, "https://img.example/dy.jpg");
  assert.equal(p.parseVideo("xiaohongshu", {id: "123", title: "视频", create_time: 1765876097, video_info_v2: {image: {thumbnail: "https://img.example/xhs.jpg"}}}, "1").coverUrl, "https://img.example/xhs.jpg");
  assert.equal(p.parseVideo("kuaishou", {photo_id: "123", caption: "视频", timestamp: 1765876097, cover_thumbnail_urls: [{url: "http://cdn.kwimgs.com/ks.jpg"}]}, "1").coverUrl, "https://cdn.kwimgs.com/ks.jpg");
  assert.equal(p.parseVideo("shipinhao", {id: "123", title: "视频", create_time: 1765876097, cover_img_url: "https://img.example/wx.jpg"}, "1").coverUrl, "https://img.example/wx.jpg");
  assert.equal(videoCoverUrl("https://img.example/a.heic", "https://img.example/a.jpeg"), "https://img.example/a.jpeg");
  assert.equal(videoCoverUrl("javascript:alert(1)", "http://untrusted.test/a"), null);
  assert.equal(videoCoverUrl("https://user:secret@img.example/a"), null);
});

test("视频号封面携带独立令牌，优先使用签名后的媒体封面", () => {
  const base = "https://wxapp.tc.qq.com/251/20304/stodownload?encfilekey=abc&idx=1";
  const signed = wechatVideoCoverUrl(base, "&token=test%2Bvalue%3D");
  assert.equal(new URL(signed!).searchParams.get("token"), "test+value=");
  assert.equal(new URL(signed!).searchParams.get("encfilekey"), "abc");
  const video = new SocialOneApiProvider().parseVideo("shipinhao", {
    id: "123", title: "视频", create_time: 1765876097,
    cover_img_url: "https://img.example/unsigned.jpg",
    media: { cover_url: base, cover_url_token: "&token=test%2Bvalue%3D" },
  }, "1");
  assert.equal(video.coverUrl, signed);
  assert.equal(wechatVideoCoverUrl(base, undefined), base);
  assert.equal(wechatVideoCoverUrl(base, "&token=abc&other=1"), base);
  assert.equal(wechatVideoCoverUrl("javascript:alert(1)", "&token=abc"), null);
});

test("其他平台头像跳过无效首选地址，并兼容快手 HTTP CDN", async () => {
  const p = new SocialOneApiProvider();
  p.client.request = async () => ({ user: {
    userid: xhs, nickname: "测试", fans: 1,
    images: "", imageb: "https://img.example/avatar.jpg",
  } });
  assert.equal((await p.profile("xiaohongshu", xhs)).avatar, "https://img.example/avatar.jpg");
  p.client.request = async () => ({ result: 1, userProfile: {
    profile: { user_id: "123456", user_name: "测试", headurl: "http://cdn.kwimgs.com/avatar.jpg" },
    ownerCount: { fan: 1 },
  } });
  assert.equal((await p.profile("kuaishou", "123456")).avatar, "https://cdn.kwimgs.com/avatar.jpg");
});

test("快手按实际 timestamp 选择最新视频，小红书重复笔记不重复查询详情", async () => {
  const p = new SocialOneApiProvider();
  p.client.request = async () => ({ result: 1, pcursor: "no_more", feeds: [
    { photo_id: "1", user_id: "123456", timestamp: 1795508400000, caption: "旧作品" },
    { photo_id: "2", user_id: "123456", timestamp: 1795508420000, caption: "新作品" },
  ] });
  assert.equal((await p.videos("kuaishou", "123456", "123456", "0", 1)).videos[0].remoteId, "2");
  let detailCalls = 0;
  p.client.request = async (path) => {
    if (path === "fetch_user_note_list") return { notes: [
      { id: "1", type: "video", create_time: 1795508420 },
      { id: "1", type: "video", create_time: 1795508420 },
    ], has_more: false };
    detailCalls++;
    return { id: "1", user: { userid: xhs }, desc: "测试", liked_count: 1 };
  };
  assert.equal((await p.videos("xiaohongshu", xhs, xhs, "0")).videos.length, 1);
  assert.equal(detailCalls, 1);
});
