import { theme } from "antd";

export const interactionKeys = [
  "likes",
  "comments",
  "shares",
  "collects",
] as const;
export const interactionLabels = {
  likes: "点赞量(率)",
  comments: "评论量(率)",
  shares: "分享量(率)",
  collects: "收藏量(率)",
};

export function interactionRate(
  count: number | null | undefined,
  views: number | null | undefined,
) {
  return count != null && views != null && views > 0 ? count / views : null;
}

export default function InteractionMetric({
  count,
  rate,
  compact = false,
  wrap = false,
}: {
  count: number | null | undefined;
  rate: number | null | undefined;
  compact?: boolean;
  wrap?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <span style={{ whiteSpace: wrap ? "normal" : "nowrap" }}>
      <span style={{ color: token.colorText }}>
        {count == null
          ? "—"
          : compact && Math.abs(count) >= 10000
            ? `${(count / 10000).toFixed(2).replace(/\.?0+$/, "")}万`
            : count.toLocaleString("zh-CN")}
      </span>
      <span
        style={{
          color: rate == null ? token.colorTextSecondary : token.colorInfo,
          fontSize: "0.85em",
        }}
      >
        （{rate == null ? "—" : `${(rate * 100).toFixed(2)}%`}）
      </span>
    </span>
  );
}
