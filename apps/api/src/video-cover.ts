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
