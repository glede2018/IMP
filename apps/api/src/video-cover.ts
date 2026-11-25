// 只保存可由浏览器安全加载的封面地址；快手旧版 CDN 的 HTTP 地址升级为 HTTPS。
export function videoCoverUrl(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.username || url.password) continue;
      // 抖音同一封面会同时返回 HEIC 和 JPEG，浏览器优先使用兼容格式。
      if (/\.heic$/i.test(url.pathname)) continue;
      if (url.protocol === "http:" && /(^|\.)kwimgs\.com$/i.test(url.hostname))
        url.protocol = "https:";
      if (url.protocol === "https:") return url.href;
    } catch {
      // 无效封面不影响视频指标采集。
    }
  }
  return null;
}

// 视频号 CDN 将访问令牌单独返回，缺少令牌时封面会返回 HTTP 400。
export function wechatVideoCoverUrl(value: unknown, token: unknown): string | null {
  const base = videoCoverUrl(value);
  if (!base || typeof token !== "string" || !token) return base;
  const params = new URLSearchParams(token.replace(/^[?&]/, ""));
  const entries = [...params];
  if (entries.length !== 1 || entries[0][0] !== "token" || !entries[0][1])
    return base;
  const url = new URL(base);
  url.searchParams.set("token", entries[0][1]);
  return url.href;
}
