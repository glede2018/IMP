import { videoCoverUrl } from "../src/video-cover.js";
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
