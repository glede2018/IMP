import { videoCoverUrl, wechatVideoCoverUrl } from "./video-cover.js";
import {
  DataProviderError,
  extractTags,
  type VideoData,
} from "./douyin-data-provider.js";
import { OneApiDataProvider, profileInput, nullableCount } from "./oneapi.js";
import type {
  SocialVideoResume,
  SocialVideoProgress,
} from "./social-video-progress.js";
export { nullableCount } from "./oneapi.js";
export const socialPlatforms = [
  "douyin",
  "xiaohongshu",
  "kuaishou",
  "shipinhao",
] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];
export const isSocialPlatform = (value: string): value is SocialPlatform =>
  socialPlatforms.includes(value as SocialPlatform);
export type SocialProfile = {
  uid: string;
  secUid: string;
  nickname: string;
  avatar: string | null;
  fans: bigint | null;
};
const invalid = () =>
  new DataProviderError(
    "invalid_response",
    "OneAPI 返回的用户或作品信息不完整，历史数据已保留。",
  );
const validId = (value: unknown): string => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\s<>]/.test(value)
  )
    return value;
  throw invalid();
};
function unwrap(data: any) {
  // HTTP 成功不代表业务成功，优先保留平台明确返回的异常原因。
  for (const result of [data, data?.data]) {
    if (!result || typeof result !== "object") continue;
    const failed =
      result.empty_reason === "bad_input" ||
      result.success === false ||
      (typeof result.result === "number" && result.result !== 1) ||
      (result.code != null && ![0, 200].includes(Number(result.code)));
    if (!failed) continue;
    const message =
      typeof result.message === "string" ? result.message.trim() : "";
    if (!message) continue;
    throw new DataProviderError(
      result.empty_reason === "bad_input" ? "invalid_input" : "platform_error",
      result.empty_reason === "bad_input" ? "参数异常" : message.slice(0, 1000),
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    data.success === false ||
    (typeof data.result === "number" && data.result !== 1)
  )
    throw invalid();
  if (data.data && typeof data.data === "object") {
    if (
      data.code != null &&
      Number(data.code) !== 0 &&
      Number(data.code) !== 200
    )
      throw invalid();
    return data.data;
  }
  return data;
}
// 主动查询仅发送该平台白名单中的分享链接，禁止把任意地址交给第三方解析。
export function socialProfileInput(
  platform: SocialPlatform,
  input: { user_id?: string; sec_uid?: string; share_text?: string },
): string | null {
  if (platform === "douyin")
    return profileInput({
      sec_uid: input.user_id || input.sec_uid,
      share_text: input.share_text,
    });
  const id = input.user_id?.trim();
  if (id) {
    if (platform === "xiaohongshu")
      return /^[a-fA-F0-9]{24}$/.test(id) ? id.toLowerCase() : null;
    if (platform === "kuaishou")
      return /^(?:\d{1,30}|[A-Za-z0-9_-]{6,100})$/.test(id) ? id : null;
    return /^(?:sph[A-Za-z0-9_-]{5,150}|v2_[A-Za-z0-9_-]{10,450}@finder)$/.test(
      id,
    )
      ? id
      : null;
  }
  const text = input.share_text?.trim();
  if (!text) return null;
  const match = text.match(/https:\/\/[^\s<>"'，。；）)]+/u)?.[0];
  if (!match) return null;
  try {
    const url = new URL(match);
    const hosts =
      platform === "xiaohongshu"
        ? [
            "xhslink.com",
            "www.xhslink.com",
            "xiaohongshu.com",
            "www.xiaohongshu.com",
          ]
        : platform === "kuaishou"
          ? [
              "v.kuaishou.com",
              "www.kuaishou.com",
              "kuaishou.com",
              "www.gifshow.com",
            ]
          : ["weixin.qq.com", "channels.weixin.qq.com"];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !hosts.includes(url.hostname)
    )
      return null;
    // 视频号资料使用 finder username；主页链接或视频分享链接先解析发布者。
    if (platform === "shipinhao") {
      const key =
        url.searchParams.get("username") ||
        url.searchParams.get("channel_id") ||
        url.pathname
          .split("/")
          .find((p) => /^sph[A-Za-z0-9_-]{5,150}$/.test(p));
      return key
        ? socialProfileInput(platform, { user_id: key })
        : url.hostname === "weixin.qq.com" && url.pathname.startsWith("/sph/")
          ? url.href
          : null;
    }
    return url.href;
  } catch {
    return null;
  }
}
function timestamp(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw invalid();
  const date = new Date(n > 1e12 ? n : n * 1000);
  if (!Number.isFinite(date.getTime())) throw invalid();
  return date;
}
function assertOwner(actual: unknown, expected: string) {
  if (actual != null && validId(actual) !== expected)
    throw new DataProviderError(
      "invalid_response",
      "作品所属用户与绑定账号不一致，已停止采集。",
    );
}
function listPage(
  rows: unknown,
  hasMore: unknown,
  next: unknown,
  cursor: string,
) {
  if (
    !Array.isArray(rows) ||
    rows.length > 200 ||
    ![0, 1, true, false].includes(hasMore as any)
  )
    throw invalid();
  const token = next == null ? "" : String(next);
  if (
    hasMore &&
    (!token ||
      token.length > 8192 ||
      token === cursor ||
      token === "0" ||
      !rows.length)
  )
    throw invalid();
  return { rows, hasMore: !!hasMore, cursor: hasMore ? token : "0" };
}
export class SocialOneApiProvider {
  readonly client = new OneApiDataProvider();
  availability() {
    return this.client.availability();
  }
  async profile(
    platform: SocialPlatform,
    input: string,
  ): Promise<SocialProfile> {
    if (platform === "douyin") return this.client.profile(input);
    let uid: string,
      user: any,
      fans: unknown,
      nickname: unknown,
      avatar: string | null;
    if (platform === "xiaohongshu") {
      const data = unwrap(
        await this.client.request(
          "fetch_user_data",
          {
            user_id: /^[a-f0-9]{24}$/.test(input) ? input : "",
            share_text: input.startsWith("https://") ? input : "",
          },
          "xiaohongshu-v2",
        ),
      );
      user = data.user || data;
      uid = validId(user.userid ?? user.user_id);
      nickname = user.nickname;
      avatar = videoCoverUrl(user.images, user.imageb, user.avatar);
      fans = user.fans;
      if (!/^[a-f0-9]{24}$/i.test(uid)) throw invalid();
      if (!input.startsWith("https://")) assertOwner(uid, input);
    } else if (platform === "kuaishou") {
      const data = unwrap(
        await this.client.request(
          "fetch_user_data",
          {
            uid: input.startsWith("https://") ? "" : input,
            share_text: input.startsWith("https://") ? input : "",
          },
          "kuaishou",
        ),
      );
      user = data.userProfile?.profile;
      if (!user) throw invalid();
      uid = validId(user.user_id);
      if (!/^\d+$/.test(uid)) throw invalid();
      nickname = user.user_name;
      avatar = videoCoverUrl(
        user.headurl,
        ...(user.bigHeadUrls || []).map((image: any) => image.url),
      );
      fans = data.userProfile.ownerCount?.fan;
      if (!input.startsWith("https://")) {
        if (/^\d+$/.test(input)) assertOwner(uid, input);
        else assertOwner(user.eid, input);
      }
    } else {
      let username = input;
      if (input.startsWith("https://")) {
        const resolved = unwrap(
          await this.client.request(
            "fetch_video_detail",
            { share_url: input, raw: false },
            "wechat-channels-v2",
          ),
        );
        username = validId(resolved.username ?? resolved.video?.username);
      }
      if (input.startsWith("sph")) {
        const resolved = unwrap(
          await this.client.request(
            "fetch_channel_id_to_username",
            { channel_id: input, raw: false },
            "wechat-channels-v2",
          ),
        );
        username = validId(resolved.username);
      }
      if (!/^v2_[A-Za-z0-9_-]+@finder$/.test(username)) throw invalid();
      user = unwrap(
        await this.client.request(
          "fetch_home_page",
          { username, raw: false },
          "wechat-channels-v2",
        ),
      );
      uid = validId(user.username);
      assertOwner(uid, username);
      nickname = user.nickname;
      avatar = videoCoverUrl(user.head_url);
      fans = user.fans_count;
    }
    if (typeof nickname !== "string" || !nickname.trim()) throw invalid();
    return {
      uid,
      secUid: uid,
      nickname: nickname.slice(0, 100),
      avatar,
      fans: nullableCount(fans),
    };
  }
  async videos(
    platform: SocialPlatform,
    identity: string,
    uid: string,
    cursor: string,
    limit = Infinity,
    resume?: SocialVideoResume,
  ) {
    if (platform === "douyin")
      return this.client.videos(identity, uid, cursor, limit);
    if (cursor.length > 8192) throw invalid();
    const initial = cursor === "0" ? "" : cursor;
    let page: ReturnType<typeof listPage>;
    if (resume?.progress.page?.inputCursor === cursor) {
      page = resume.progress.page;
    } else if (platform === "xiaohongshu") {
      const data = unwrap(
        await this.client.request(
          "fetch_user_note_list",
          { user_id: uid, share_text: "", cursor: initial },
          "xiaohongshu-v2",
        ),
      );
      page = listPage(
        data.notes,
        data.has_more,
        data.cursor ?? data.notes?.at(-1)?.cursor ?? data.notes?.at(-1)?.id,
        initial,
      );
    } else if (platform === "kuaishou") {
      const data = unwrap(
        await this.client.request(
          "fetch_user_video_list_v3",
          { user_id: uid, pcursor: initial, sort: "latest" },
          "kuaishou",
        ),
      );
      if (typeof data.pcursor !== "string") throw invalid();
      page = listPage(
        data.feeds,
        data.pcursor !== "no_more" && data.pcursor !== "",
        data.pcursor,
        initial,
      );
    } else {
      const data = unwrap(
        await this.client.request(
          "fetch_user_video_list",
          { username: uid, last_buffer: initial, raw: false },
          "wechat-channels-v2",
        ),
      );
      assertOwner(data.username, uid);
      page = listPage(data.videos, data.up_continue, data.last_buffer, initial);
    }
    const videos: VideoData[] = [];
    const seen = new Set<string>(resume?.progress.seenIds || []);
    const ordered = [...page.rows].sort((a, b) => {
      const time = (row: any) => {
        const value = Number(
          row.create_time ??
            row.time ??
            row.timestamp ??
            row.photo?.timestamp ??
            0,
        );
        return value > 1e12 ? value : value * 1000;
      };
      return time(b) - time(a);
    });
    let progress: SocialVideoProgress | undefined = resume
      ? {
          ...resume.progress,
          page: {
            inputCursor: cursor,
            cursor: page.cursor,
            hasMore: page.hasMore,
            rows: ordered,
          },
        }
      : undefined;
    if (progress) await resume!.onProgress(progress);
    for (let index = 0; index < ordered.length; index++) {
      if (videos.length >= limit) break;
      const row = ordered[index];
      const advance = async (video?: VideoData) => {
        if (!progress) return;
        const next: SocialVideoProgress = {
          ...progress,
          seenIds: [...seen],
          page: {
            inputCursor: cursor,
            cursor: page.cursor,
            hasMore: page.hasMore,
            rows: ordered.slice(index + 1),
          },
        };
        await resume!.onProgress(next, video);
        progress = next;
      };
      // 小红书图文笔记不计入视频统计，但仍使用完整列表的游标继续扫描。
      if (platform === "xiaohongshu" && row.type !== "video") {
        await advance();
        continue;
      }
      let item = row;
      if (platform === "xiaohongshu") {
        // 列表标题未必含完整话题，视频详情用于获取完整文案和标签。
        const remoteId = validId(row.note_id ?? row.id);
        if (seen.has(remoteId)) {
          await advance();
          continue;
        }
        const details = unwrap(
          await this.client.request(
            "fetch_video_note_detail",
            { note_id: remoteId, share_text: "" },
            "xiaohongshu-v2",
          ),
        );
        const detail = Array.isArray(details)
          ? details.find((d) => String(d.id ?? d.note_id) === remoteId)
          : details;
        if (!detail || validId(detail.id ?? detail.note_id) !== remoteId)
          throw invalid();
        item = {
          ...row,
          ...detail,
          create_time: row.create_time ?? detail.time,
          likes: detail.liked_count ?? row.likes,
          share_count:
            detail.shared_count ??
            detail.interaction_info?.share_count ??
            row.share_count,
        };
      }
      // 快手和视频号的列表已含完整文案和统计，避免重复收费查询详情。
      const parsed = this.parseVideo(platform, item, uid);
      if (!seen.has(parsed.remoteId)) {
        seen.add(parsed.remoteId);
        await advance(parsed);
        videos.push(parsed);
      } else await advance();
    }
    return { videos, hasMore: page.hasMore, cursor: page.cursor };
  }
  parseVideo(
    platform: Exclude<SocialPlatform, "douyin">,
    row: any,
    uid: string,
  ): VideoData {
    let remoteId: string,
      title: string,
      time: unknown,
      metrics: NonNullable<VideoData["metrics"]>;
    if (platform === "xiaohongshu") {
      assertOwner(row.user?.userid ?? row.user?.user_id, uid);
      remoteId = validId(row.note_id ?? row.id);
      title = row.desc || row.title || row.display_title || "";
      time = row.create_time;
      metrics = {
        views: nullableCount(row.view_count),
        likes: nullableCount(row.likes ?? row.liked_count),
        comments: nullableCount(row.comments_count ?? row.comment_count),
        shares: nullableCount(row.share_count),
        collects: nullableCount(row.collected_count),
      };
    } else if (platform === "kuaishou") {
      assertOwner(row.user_id, uid);
      remoteId = validId(row.photo_id ?? row.id);
      title = row.caption ?? "";
      time = row.timestamp ?? row.create_time;
      metrics = {
        views: nullableCount(row.view_count),
        likes: nullableCount(row.like_count),
        comments: nullableCount(row.comment_count),
        shares: nullableCount(row.share_count ?? row.forward_count),
        collects: nullableCount(row.collect_count),
      };
    } else {
      assertOwner(row.username, uid);
      remoteId = validId(row.id);
      title = row.title ?? row.description ?? "";
      time = row.create_time;
      metrics = {
        views: nullableCount(row.read_count),
        likes: nullableCount(row.like_count),
        comments: nullableCount(row.comment_count),
        shares: nullableCount(row.forward_count),
        collects: nullableCount(row.fav_count),
      };
    }
    if (typeof title !== "string") throw invalid();
    return {
      remoteId,
      title: title.slice(0, 4000),
      coverUrl:
        platform === "xiaohongshu"
          ? videoCoverUrl(
              row.video_info_v2?.image?.thumbnail,
              row.video_info_v2?.image?.first_frame,
              row.images_list?.[0]?.url,
            )
          : platform === "kuaishou"
            ? videoCoverUrl(
                ...(row.cover_thumbnail_urls || []).map(
                  (image: any) => image.url,
                ),
                ...(row.ff_cover_thumbnail_urls || []).map(
                  (image: any) => image.url,
                ),
              )
            : videoCoverUrl(
                wechatVideoCoverUrl(
                  row.media?.cover_url,
                  row.media?.cover_url_token,
                ),
                row.cover_img_url,
              ),
      publishedAt: timestamp(time),
      tags: extractTags({
        title,
        text_extra:
          platform === "xiaohongshu" && Array.isArray(row.hash_tag)
            ? row.hash_tag.map((t: any) => ({ hashtag_name: t.name }))
            : [],
      }),
      metrics,
    };
  }
}
