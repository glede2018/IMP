import { Injectable } from "@nestjs/common";

export class DataProviderError extends Error {
  constructor(
    public state: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export const countValue = (value: unknown): bigint => {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new DataProviderError(
      "invalid_response",
      "平台未返回完整有效的指标，未写入统计。",
    );
  return BigInt(value);
};
export function normalizeTrackingTag(value: string) {
  const tag = value
    .normalize("NFKC")
    .trim()
    .replace(/^#/, "")
    .toLocaleLowerCase("en-US");
  if (!/^[\p{L}\p{N}\p{M}_]{1,100}$/u.test(tag))
    throw new DataProviderError(
      "invalid_tag",
      "tag 仅支持中英文、数字和下划线，最多100字符。",
    );
  return tag;
}
export function extractTags(row: Record<string, any>): string[] {
  const tags = (Array.isArray(row.text_extra) ? row.text_extra : [])
    .map((t: any) => t.hashtag_name)
    .filter((v: unknown) => typeof v === "string");
  for (const match of String(row.title || "").matchAll(
    /#([\p{L}\p{N}\p{M}_]+)/gu,
  ))
    tags.push(match[1]);
  return [
    ...new Set(
      tags.flatMap((tag: string) => {
        try {
          return [normalizeTrackingTag(tag)];
        } catch {
          return [];
        }
      }),
    ),
  ];
}
export function matchTrackingTags(
  tags: string[],
  bindings: {
    id: string;
    tag: string;
    templateId?: string | null;
    version?: string;
    active?: boolean;
    deletedAt?: Date | null;
  }[],
) {
  const present = new Set(tags);
  const matched = bindings
    .filter(
      (b) =>
        present.has(b.tag) &&
        b.templateId !== null &&
        b.active !== false &&
        !b.deletedAt,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, (typeof matched)[number]>();
  for (const b of matched) {
    const key = b.templateId
      ? JSON.stringify([b.templateId, b.version || ""])
      : b.id;
    if (!groups.has(key)) groups.set(key, b);
  }
  return {
    bindingId: groups.size === 1 ? [...groups.values()][0].id : null,
    matchStatus:
      groups.size === 1
        ? "matched"
        : groups.size > 1
          ? "conflict"
          : "unmatched",
  };
}
export const bucketFor = (date: Date) =>
  new Date(Math.floor(date.getTime() / 3600000) * 3600000);
export const shanghaiDate = (date: Date) =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const sampleDelta = <T extends { capturedAt: Date }>(
  samples: T[],
  start: Date,
  end: Date,
  read: (s: T) => bigint,
) => {
  const before = samples.filter((s) => s.capturedAt < start).at(-1);
  const after = samples.filter((s) => s.capturedAt < end).at(-1);
  // No historical zero, and no delta across a range containing no observation.
  if (!before || !after || after.capturedAt < start) return null;
  return Number(read(after) - read(before));
};
export type VideoData = {
  remoteId: string;
  title: string;
  publishedAt: Date;
  tags: string[];
  metrics: {
    views: bigint;
    likes: bigint;
    comments: bigint;
    shares: bigint;
  } | null;
};
export function parseVideo(row: Record<string, any>): VideoData {
  if (
    typeof row.item_id !== "string" ||
    !row.item_id ||
    row.item_id.length > 512 ||
    typeof row.title !== "string" ||
    !Number.isSafeInteger(row.create_time) ||
    row.create_time <= 0
  )
    throw new DataProviderError(
      "invalid_response",
      "视频信息缺失或视频非公开，保留历史数据。",
    );
  const statistics = row.statistics;
  return {
    remoteId: row.item_id,
    title: row.title.slice(0, 4000),
    publishedAt: new Date(row.create_time * 1000),
    tags: extractTags(row),
    metrics: statistics
      ? {
          views: countValue(statistics.play_count),
          likes: countValue(statistics.digg_count),
          comments: countValue(statistics.comment_count),
          shares: countValue(statistics.share_count),
        }
      : null,
  };
}

@Injectable()
export class DouyinDataProvider {
  availability(kind: string, scopes: string[]) {
    if (kind === "videos") {
      // This is an explicitly opted-in compatibility adapter, not a claim of current application eligibility.
      if (process.env.DOUYIN_VIDEO_API_PROFILE !== "website_v1")
        return "视频接口尚未启用；需先确认该网站应用仍获准调用 website_v1 视频查询接口。";
      if (
        !scopes.includes("video.list.bind") ||
        !scopes.includes("video.data.bind")
      )
        return "账号尚未授予 video.list.bind 和 video.data.bind，请开通能力后重新授权。";
    } else {
      if (process.env.DOUYIN_FANS_SYNC_ENABLED !== "true")
        return "粉丝采集尚未启用，请先开通并验证 fans.data.bind 能力。";
      if (!scopes.includes("fans.data.bind"))
        return "账号尚未授予 fans.data.bind，请开通能力后重新授权。";
    }
    return null;
  }
  async transport(
    path: string,
    token: string,
    query: Record<string, string>,
    body?: object,
  ): Promise<Record<string, any>> {
    const allowed = [
      "/api/douyin/v1/video/video_list/",
      "/api/douyin/v1/video/video_data/",
      "/api/douyin/v1/user/fans_data/",
    ];
    if (!allowed.includes(path))
      throw new DataProviderError("unsupported", "不支持的接口配置。");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `https://open.douyin.com${path}?${new URLSearchParams(query)}`,
          {
            method: body ? "POST" : "GET",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            headers: {
              "access-token": token,
              "Content-Type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          },
        );
        if (!response.ok)
          throw new DataProviderError(
            response.status === 429 ? "rate_limited" : "platform_error",
            "抖音接口暂时不可用，请稍后重试。",
            response.status === 429 || response.status >= 500,
          );
        const payload = (await response.json()) as Record<string, any>;
        for (const code of [
          payload.error_code,
          payload.data?.error_code,
          payload.extra?.error_code,
        ]) {
          if (code === undefined || Number(code) === 0) continue;
          const n = Number(code);
          if ([28001056].includes(n))
            throw new DataProviderError(
              "unsupported",
              "平台提示该接口已下线，已停止自动重试；需确认新的获批接入方案。",
            );
          if ([28001003, 28001008, 2190002, 2190008, 28001012].includes(n))
            throw new DataProviderError(
              "authorization_required",
              "授权凭证无效或过期，请重新授权。",
            );
          if ([28001014, 28001018, 28001019, 2190004].includes(n))
            throw new DataProviderError(
              "permission_required",
              "应用未开通或已失去该数据能力，请核对开放平台权限。",
            );
          if ([28003017, 2118110, 2119003].includes(n))
            throw new DataProviderError(
              "rate_limited",
              "平台额度或频率受限，稍后自动重试。",
              true,
            );
          throw new DataProviderError(
            "platform_error",
            "抖音返回业务错误，未覆盖已有统计。",
            [2100004, 28001005, 28001006].includes(n),
          );
        }
        if (!payload.data || typeof payload.data !== "object")
          throw new DataProviderError(
            "invalid_response",
            "平台响应格式异常，未写入统计。",
          );
        return payload.data;
      } catch (error) {
        const safe =
          error instanceof DataProviderError
            ? error
            : new DataProviderError(
                "network_error",
                "连接抖音失败，稍后自动重试。",
                true,
              );
        if (!safe.retryable || safe.state === "rate_limited" || attempt === 2)
          throw safe;
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      }
    }
    throw new DataProviderError("network_error", "连接抖音失败。", true);
  }
  async videos(token: string, openId: string, cursor: string) {
    const page = await this.transport(
      "/api/douyin/v1/video/video_list/",
      token,
      { open_id: openId, cursor, count: "20" },
    );
    if (!Array.isArray(page.list) || typeof page.has_more !== "boolean")
      throw new DataProviderError(
        "invalid_response",
        "视频分页响应不完整，未推进游标。",
      );
    const rows = page.list.map((row: Record<string, any>) => parseVideo(row));
    // Some list capabilities omit metrics. Query only this account's returned IDs, in a bounded batch.
    if (rows.length) {
      const details = await this.transport(
        "/api/douyin/v1/video/video_data/",
        token,
        { open_id: openId },
        { item_ids: rows.map((v: VideoData) => v.remoteId) },
      );
      if (!Array.isArray(details.list))
        throw new DataProviderError(
          "invalid_response",
          "视频指标响应不完整，未推进游标。",
        );
      const byId = new Map(
        details.list.map((v: Record<string, any>) => {
          const parsed = parseVideo(v);
          return [parsed.remoteId, parsed];
        }),
      );
      for (const row of rows)
        row.metrics =
          (byId.get(row.remoteId) as VideoData | undefined)?.metrics ||
          row.metrics;
    }
    const next = String(page.cursor ?? "");
    if (page.has_more && (!/^\d+$/.test(next) || next === cursor))
      throw new DataProviderError(
        "invalid_response",
        "视频分页游标未前进，已停止本轮同步。",
      );
    return {
      videos: rows as VideoData[],
      hasMore: page.has_more as boolean,
      cursor: next || "0",
    };
  }
  async fans(token: string, openId: string) {
    const data = await this.transport("/api/douyin/v1/user/fans_data/", token, {
      open_id: openId,
    });
    if (!data.fans_data || data.fans_data.all_fans_num == null)
      throw new DataProviderError(
        "awaiting_data",
        "平台暂未产出粉丝数据，可能处于首次授权等待期或未满足粉丝门槛。",
      );
    return countValue(data.fans_data.all_fans_num);
  }
}
