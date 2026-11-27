import { videoCoverUrl } from "./video-cover.js";
import { randomUUID } from "node:crypto";
import { collectionLog, collectionErrorDetails } from "./collection-log.js";
import { waitForOneApiSlot } from "./oneapi-rate-limit.js";
import {
  countValue,
  DataProviderError,
  extractTags,
  type VideoData,
} from "./douyin-data-provider.js";

export const oneapiEnabled = () =>
  process.env.DOUYIN_DATA_PROVIDER === "oneapi";
export const metricSource = () => (oneapiEnabled() ? "oneapi_v2" : "official");

// 临时失败在当天补偿，不推迟下一轮北京时间零点的正常采集。
export function nextOneApiRetry(failures: number, now = new Date()) {
  const minutes = [1, 2, 3, 5][
    Math.min(3, Math.max(0, Math.floor(failures)))
  ];
  return new Date(
    Math.min(now.getTime() + minutes * 60000, nextDailySync(now).getTime()),
  );
}

// 平台未提供或返回无效指标时保留为空，不能补零或丢弃其他有效指标。
export const nullableCount = (value: unknown): bigint | null => {
  if (value == null || value === "") return null;
  try {
    return countValue(value);
  } catch {
    return null;
  }
};

// 固定北京时间零点开始下一轮，分页续传和失败重试不算新的每日任务。
export function nextDailySync(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600000);
  const next = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      0,
    ) -
      8 * 3600000,
  );
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
export function validDataProfile(value: string) {
  if (/^MS4wLj[A-Za-z0-9_-]{10,300}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "v.douyin.com" ||
        url.hostname === "www.douyin.com" ||
        url.hostname === "douyin.com") &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}
// 分享文案可包含说明文字，只提取抖音 HTTPS 链接；同时填写时优先 sec_uid。
export function profileInput(input: { sec_uid?: string; share_text?: string }) {
  const secUid = input.sec_uid?.trim();
  if (secUid)
    return /^MS4wLj[A-Za-z0-9_-]{10,300}$/.test(secUid) ? secUid : null;
  const share = input.share_text?.trim();
  if (!share) return null;
  const url = share.match(
    /https:\/\/(?:v\.douyin\.com|(?:www\.)?douyin\.com)\/[^\s<>"'，。；）)]+/u,
  )?.[0];
  return url && validDataProfile(url) ? url : null;
}
const invalid = () =>
  new DataProviderError(
    "invalid_response",
    "OneAPI 返回数据不完整，已保留历史数据。",
  );
function id(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value)) throw invalid();
  return value;
}
function assertOwner(row: Record<string, any>, uid: string, secUid: string) {
  const author = row.author;
  if (
    (author?.uid !== undefined && author.uid !== uid) ||
    (author?.sec_uid && author.sec_uid !== secUid)
  )
    throw new DataProviderError(
      "invalid_response",
      "视频所属用户与采集主页不一致，已停止采集。",
    );
}
export function parseOneApiVideo(
  row: Record<string, any>,
  uid: string,
  secUid: string,
): VideoData {
  assertOwner(row, uid, secUid);
  const remoteId = id(row.aweme_id);
  const time = Number(row.create_time);
  if (
    typeof row.desc !== "string" ||
    !Number.isSafeInteger(time) ||
    time <= 0 ||
    !Number.isFinite(new Date(time * 1000).getTime())
  )
    throw invalid();
  return {
    remoteId,
    title: row.desc.slice(0, 4000),
    coverUrl: videoCoverUrl(
      ...(row.video?.cover?.url_list || []),
      ...(row.video?.origin_cover?.url_list || []),
    ),
    publishedAt: new Date(time * 1000),
    tags: extractTags({ ...row, title: row.desc }),
    metrics: null,
  };
}
// Node.js 22 保留超出安全整数范围的原始数字文本，避免快手作品 ID 丢失精度。
export function parseOneApiJson(value: string) {
  return JSON.parse(value, (_key, parsed, context?: { source: string }) =>
    typeof parsed === "number" &&
    !Number.isSafeInteger(parsed) &&
    context?.source &&
    /^-?\d+$/.test(context.source)
      ? context.source
      : parsed,
  );
}
export class OneApiDataProvider {
  availability() {
    return process.env.ONEAPI_API_KEY?.trim()
      ? null
      : "请配置 ONEAPI_API_KEY 后采集平台数据。";
  }
  async request(
    path: string,
    body: object,
    namespace:
      | "douyin-app"
      | "xiaohongshu-v2"
      | "kuaishou"
      | "wechat-channels-v2" = "douyin-app",
  ): Promise<any> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const requestInfo = {
      requestId,
      endpoint: `/api/${namespace}/${path}`,
      namespace,
      platform: {
        "douyin-app": "douyin",
        "xiaohongshu-v2": "xiaohongshu",
        kuaishou: "kuaishou",
        "wechat-channels-v2": "shipinhao",
      }[namespace],
    };
    const key = process.env.ONEAPI_API_KEY?.trim();
    if (!key) {
      collectionLog("error", "oneapi.request.blocked", {
        ...requestInfo,
        state: "permission_required",
      });
      throw new DataProviderError(
        "permission_required",
        "未配置 OneAPI 密钥。",
      );
    }
    // 每次请求独立计时；首次失败后重试两次，不输出密钥或上游原始响应。
    for (let attempt = 0; attempt < 3; attempt++) {
      const { queueWaitMs, rps } = await waitForOneApiSlot();
      const signal = AbortSignal.timeout(30000);
      const attemptStartedAt = Date.now();
      let requestPhase = "connect";
      let httpStatus: number | undefined;
      let upstreamCode: number | undefined;
      const attemptInfo = {
        ...requestInfo,
        attempt: attempt + 1,
        maxAttempts: 3,
        timeoutMs: 30000,
        queueWaitMs,
        rps,
      };
      collectionLog("log", "oneapi.request.started", attemptInfo);
      try {
        const response = await fetch(
          `https://api.getoneapi.com/api/${namespace}/${path}`,
          {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
        httpStatus = response.status;
        requestPhase = "validate_http";
        if (response.status === 401 || response.status === 403)
          throw new DataProviderError(
            "permission_required",
            "OneAPI 密钥无效或接口权限不足。",
          );
        if (response.status === 429)
          throw new DataProviderError(
            "rate_limited",
            "OneAPI 额度或调用频率受限。",
            true,
          );
        if (!response.ok)
          throw new DataProviderError(
            "platform_error",
            "OneAPI 服务暂时不可用。",
            true,
          );
        requestPhase = "read_response";
        const responseText = await response.text();
        requestPhase = "parse_response";
        const payload = parseOneApiJson(responseText) as Record<string, any>;
        requestPhase = "validate_response";
        if (Number.isFinite(Number(payload.code)))
          upstreamCode = Number(payload.code);
        if (Number(payload.code) === 301)
          throw new DataProviderError(
            "quota_exhausted",
            "OneAPI 余额不足，请充值后等待下次定时采集。",
          );
        if ([401, 403].includes(Number(payload.code)))
          throw new DataProviderError(
            "permission_required",
            "OneAPI 密钥无效或接口权限不足。",
          );
        if (Number(payload.code) !== 200 || payload.data == null)
          throw new DataProviderError(
            "platform_error",
            "OneAPI 返回业务错误，请检查服务余额和接口状态。",
            true,
          );
        const data = payload.data;
        if (data.status_code !== undefined && Number(data.status_code) !== 0)
          throw invalid();
        collectionLog("log", "oneapi.request.succeeded", {
          ...attemptInfo,
          httpStatus,
          upstreamCode,
          durationMs: Date.now() - attemptStartedAt,
          totalDurationMs: Date.now() - startedAt,
        });
        return data;
      } catch (error) {
        const timeout =
          signal.aborted ||
          (error instanceof Error && error.name === "TimeoutError");
        collectionLog(attempt < 2 ? "warn" : "error", "oneapi.request.failed", {
          ...attemptInfo,
          requestPhase,
          httpStatus,
          upstreamCode,
          timeout,
          durationMs: Date.now() - attemptStartedAt,
          totalDurationMs: Date.now() - startedAt,
          willRetry: attempt < 2,
          state:
            error instanceof DataProviderError ? error.state : "network_error",
          ...collectionErrorDetails(error),
        });
        if (attempt < 2) continue;
        if (error instanceof DataProviderError)
          throw new DataProviderError(
            error.state,
            `${error.message}（已重试 2 次）`,
            error.retryable,
          );
        throw new DataProviderError(
          "network_error",
          timeout
            ? "OneAPI 请求超时（每次 30 秒，已重试 2 次）。"
            : "连接 OneAPI 失败（已重试 2 次），历史数据已保留。",
          true,
        );
      }
    }
  }
  async profile(profile: string) {
    if (!validDataProfile(profile))
      throw new DataProviderError(
        "blocked",
        "请填写有效的抖音主页链接或用户ID",
      );
    const data = await this.request(
      "fetch_user_data",
      profile.startsWith("MS4wLj")
        ? { sec_user_id: profile, share_text: "" }
        : { sec_user_id: "", share_text: profile },
    );
    const user = data.user;
    if (
      !user ||
      !validDataProfile(user.sec_uid) ||
      !String(user.sec_uid).startsWith("MS4wLj") ||
      typeof user.nickname !== "string" ||
      !user.nickname.trim()
    )
      throw invalid();
    if (profile.startsWith("MS4wLj") && user.sec_uid !== profile)
      throw invalid();
    // 抖音头像首项常为 HEIC，遍历备选地址以选择浏览器兼容的图片。
    const avatar = videoCoverUrl(
      ...(user.avatar_thumb?.url_list || []),
      ...(user.avatar_medium?.url_list || []),
      ...(user.avatar_larger?.url_list || []),
      ...(user.avatar_300x300?.url_list || []),
      ...(user.avatar_168x168?.url_list || []),
    );
    return {
      uid: id(user.uid),
      secUid: user.sec_uid as string,
      nickname: user.nickname.slice(0, 100),
      avatar,
      fans: nullableCount(user.follower_count),
    };
  }
  async statistics(ids: string[]) {
    if (!ids.length || ids.length > 20) throw invalid();
    // 批量不足二十条仍按二十条收费，尾页逐条调用，所有请求统一使用 V2 总播放量。
    if (ids.length < 20) {
      const rows = [];
      for (const aweme_id of ids)
        rows.push(
          await this.request("fetch_video_statistics_v2", {
            aweme_id,
            share_text: "",
          }),
        );
      return rows;
    }
    const data = await this.request("fetch_multiple_video_statistics_v2", {
      aweme_ids: ids,
    });
    // 批量接口直接返回视频对象，单条接口使用 item_id / item 包装；两种格式分别校验。
    if (
      data.base_resp?.status_code != null &&
      Number(data.base_resp.status_code) !== 0
    )
      throw invalid();
    const rows = Array.isArray(data)
      ? data
      : (data.items ?? data.list ?? data.results);
    if (Array.isArray(rows)) return rows;
    if (rows && typeof rows === "object")
      return Object.entries(rows).map(([item_id, row]) => ({
        item_id,
        ...(row as object),
      }));
    if (data && typeof data === "object" && ids.every((key) => data[key]))
      return ids.map((item_id) => ({ item_id, ...data[item_id] }));
    throw invalid();
  }
  async videos(secUid: string, uid: string, cursor: string, limit = Infinity) {
    if (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))
      throw invalid();
    const data = await this.request("fetch_user_video_list", {
      sec_user_id: secUid,
      share_text: "",
      count: Math.min(20, limit),
      max_cursor: Number(cursor),
      sort_type: 0,
    });
    if (data.uid && data.uid !== uid)
      throw new DataProviderError(
        "invalid_response",
        "视频列表所属用户与采集主页不一致。",
      );
    if (
      !Array.isArray(data.aweme_list) ||
      data.aweme_list.length > 200 ||
      ![true, false, 0, 1].includes(data.has_more)
    )
      throw invalid();
    // 置顶作品可能超出请求条数，先按发布时间排序并截断，再查询指标。
    const rows = [
      ...new Map<string, VideoData>(
        data.aweme_list.map((row: Record<string, any>) => {
          const parsed = parseOneApiVideo(row, uid, secUid);
          return [parsed.remoteId, parsed] as const;
        }),
      ).values(),
    ]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
    const hasMore = !!data.has_more;
    const next = String(data.max_cursor ?? "0");
    if (
      hasMore &&
      (!/^\d+$/.test(next) ||
        next === cursor ||
        !rows.length ||
        !Number.isSafeInteger(Number(next)))
    )
      throw invalid();
    if (rows.length) {
      const results: any[] = [];
      for (let offset = 0; offset < rows.length; offset += 20)
        results.push(
          ...(await this.statistics(
            rows.slice(offset, offset + 20).map((v) => v.remoteId),
          )),
        );
      const byId = new Map<string, any>();
      for (const result of results) {
        const remoteId = id(result.item_id ?? result.item?.id ?? result.id);
        if (
          !rows.some((v: VideoData) => v.remoteId === remoteId) ||
          byId.has(remoteId)
        )
          throw invalid();
        byId.set(remoteId, result);
      }
      for (const row of rows) {
        const result = byId.get(row.remoteId);
        if (!result || result.exist === false) continue;
        if (result.item?.id && result.item.id !== row.remoteId) throw invalid();
        // 星图作者 ID 与抖音 UID 不是同一命名空间，不能拿 item.author_id 与 UID 比较。
        const stats = result.stats ?? result.item?.stats;
        if (!stats) continue;
        const metrics = {
          views: nullableCount(stats.watch_cnt),
          likes: nullableCount(stats.like_cnt),
          comments: nullableCount(stats.comment_cnt),
          shares: nullableCount(stats.share_cnt),
          collects: nullableCount(stats.favorite_cnt),
        };
        if (Object.values(metrics).some((value) => value !== null))
          row.metrics = metrics;
      }
    }
    return {
      videos: rows as VideoData[],
      hasMore,
      cursor: hasMore ? next : "0",
    };
  }
}

// 每个账号每轮只采集最新的指定数量，初始化与定时任务共用。
export function videoSyncLimit(): number {
  const value = Number(process.env.ONEAPI_VIDEO_SYNC_LIMIT || 20);
  return Number.isSafeInteger(value) && value > 0 ? value : 20;
}
