import type { VideoData } from "./douyin-data-provider.js";

export type SocialVideoProgress = {
  version: 1;
  platform: string;
  identity: string;
  revision: number;
  day: string;
  seenIds: string[];
  missing: boolean;
  capturedAt?: string;
  complete?: boolean;
  page?: { inputCursor: string; cursor: string; hasMore: boolean; rows: any[] };
};
export type SocialVideoResume = {
  progress: SocialVideoProgress;
  onProgress: (
    progress: SocialVideoProgress,
    video?: VideoData,
  ) => Promise<void>;
};

// 只复用同一账号身份、同一采集日的进度，避免账号修改或跨日后误用旧列表。
export function restoreSocialVideoProgress(
  value: unknown,
  scope: Pick<
    SocialVideoProgress,
    "platform" | "identity" | "revision" | "day"
  >,
): SocialVideoProgress | null {
  if (!value || typeof value !== "object") return null;
  const p = value as SocialVideoProgress;
  if (
    p.version !== 1 ||
    Object.entries(scope).some(
      ([key, v]) => p[key as keyof typeof scope] !== v,
    ) ||
    !Array.isArray(p.seenIds) ||
    !p.seenIds.every((id) => typeof id === "string") ||
    typeof p.missing !== "boolean"
  )
    return null;
  if (
    p.page &&
    (!Array.isArray(p.page.rows) ||
      p.page.rows.length > 200 ||
      typeof p.page.cursor !== "string" ||
      typeof p.page.inputCursor !== "string" ||
      typeof p.page.hasMore !== "boolean")
  )
    return null;
  if (p.capturedAt && !Number.isFinite(Date.parse(p.capturedAt))) return null;
  if (p.complete !== undefined && typeof p.complete !== "boolean") return null;
  return p;
}
