import { platformMap } from "@/services/api";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Select,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useSearchParams } from "react-router-dom";
import {
  fetchLiveOverview,
  fetchSyncStatus,
} from "@/services/douyin-analytics";
import type { LiveMetrics, LiveVideo } from "@/services/douyin-analytics";
import ContentOperations from "./ContentOperations";
import {
  AccountPerformance,
  TemplatePerformance,
  OrderPerformance,
  BusinessPerformance,
} from "./PerformancePanels";
const text = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("zh-CN");
const labels = {
  views: "期间播放",
  likes: "期间点赞",
  comments: "期间评论",
  shares: "期间分享",
  collects: "期间收藏",
};
const types: Record<string, string> = {
  brand: "品牌",
  personal_ip: "职人",
  store_ip: "门店",
};
const tabs = [
  { key: "content", label: "内容运营" },
  { key: "business", label: "经营贡献" },
  { key: "accounts", label: "账号与视频" },
  { key: "templates", label: "模板效果" },
  { key: "orders", label: "订单与核销" },
];
export default function LiveAnalytics() {
  const [params, setParams] = useSearchParams();
  const active = tabs.some((t) => t.key === params.get("tab"))
    ? params.get("tab")!
    : "content";
  const [period, setPeriod] = useState<[string, string]>([
    dayjs().subtract(6, "day").format("YYYY-MM-DD"),
    dayjs().format("YYYY-MM-DD"),
  ]);
  const [platform, setPlatform] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [type, setType] = useState("all");
  const [detailAccount, setDetailAccount] = useState<string | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<string | null>(null);
  const [video, setVideo] = useState<LiveVideo | null>(null);
  const status = useQuery({
    queryKey: ["douyin-sync-status"],
    queryFn: fetchSyncStatus,
  });
  const overview = useQuery({
    queryKey: ["douyin-live-overview", period, accountId, type, platform],
    queryFn: () =>
      fetchLiveOverview({
        start: period[0],
        end: period[1],
        accountId,
        type,
        platform,
      }),
  });
  const data = overview.data;
  const goTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    setParams(next, { replace: true });
  };
  return (
    <div className="dc-page dc-content-page dc-performance-page">
      <div className="dc-filters">
        <Space wrap>
          <DatePicker.RangePicker
            aria-label="统计日期"
            allowClear={false}
            value={[dayjs(period[0]), dayjs(period[1])]}
            onChange={(r) => {
              if (r?.[0] && r[1])
                setPeriod([
                  r[0].format("YYYY-MM-DD"),
                  r[1].format("YYYY-MM-DD"),
                ]);
            }}
          />
          <Select
            aria-label="平台"
            style={{ width: 140 }}
            value={platform}
            options={[
              { value: "all", label: "全部平台" },
              ...Object.entries(platformMap).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(value) => {
              setPlatform(value);
              setAccountId("all");
              setDetailAccount(null);
            }}
          />
          <Select
            aria-label="矩阵账号"
            style={{ width: 200 }}
            value={accountId}
            options={[
              { value: "all", label: "全部矩阵账号" },
              ...(status.data || [])
                .filter(
                  (a) =>
                    ["live", "oneapi"].includes(a.mode) &&
                    (type === "all" || a.type === type) &&
                    (platform === "all" || a.platform === platform),
                )
                .map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={(v) => {
              setAccountId(v);
              setDetailAccount(null);
            }}
          />
          <Select
            aria-label="账号类型"
            style={{ width: 170 }}
            value={type}
            options={[
              { value: "all", label: "品牌 / 职人 / 门店" },
              ...Object.entries(types).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(v) => {
              setType(v);
              setAccountId("all");
              setDetailAccount(null);
            }}
          />
        </Space>
        <Typography.Text type="secondary">
          {platform === "all"
            ? "全部平台"
            : platformMap[platform as keyof typeof platformMap]}{" "}
          · 更新于{" "}
          {data?.syncedAt ? dayjs(data.syncedAt).format("MM.DD HH:mm") : "—"}
        </Typography.Text>
      </div>
      <Tabs activeKey={active} onChange={goTab} items={tabs} />
      {(overview.error || status.error) && (
        <Alert
          type="error"
          message={overview.error?.message || status.error?.message}
          action={
            <Button
              onClick={() => {
                void overview.refetch();
                void status.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      )}
      {overview.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : overview.isError ? null : (
        <>
          {active === "content" && (
            <ContentOperations
              data={data}
              onVideo={setVideo}
              onAccount={(id) => {
                setDetailAccount(id);
                goTab("accounts");
              }}
              onTemplate={(id) => {
                setDetailTemplate(id);
                goTab("templates");
              }}
            />
          )}
          {active === "accounts" && (
            <AccountPerformance
              data={data}
              selected={detailAccount}
              onSelect={setDetailAccount}
              onVideo={setVideo}
            />
          )}
          {active === "templates" && (
            <TemplatePerformance
              data={data}
              selected={detailTemplate}
              onSelect={setDetailTemplate}
              onVideo={setVideo}
            />
          )}
          {active === "orders" && <OrderPerformance />}
          {active === "business" && <BusinessPerformance />}
        </>
      )}
      <Drawer
        title="视频明细"
        zIndex={1100}
        open={!!video}
        onClose={() => setVideo(null)}
        width={560}
      >
        {video && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: "title", label: "标题", children: video.title },
                {
                  key: "remote",
                  label: "平台视频 ID",
                  children: video.remoteId,
                },
                {
                  key: "tags",
                  label: "话题",
                  children: video.tags.map((t) => <Tag key={t}>#{t}</Tag>),
                },
                {
                  key: "template",
                  label: "关联模板",
                  children: video.template
                    ? `${video.template.title} · ${video.template.version}`
                    : "未匹配或有冲突",
                },
                {
                  key: "time",
                  label: "采集时间",
                  children: video.capturedAt
                    ? dayjs(video.capturedAt).format("YYYY-MM-DD HH:mm:ss")
                    : "尚无指标快照",
                },
                ...Object.entries(labels).map(([key, label]) => ({
                  key,
                  label,
                  children: text(video.metrics[key as keyof LiveMetrics]),
                })),
                ...Object.entries(labels).map(([key, label]) => ({
                  key: `latest-${key}`,
                  label: label.replace("期间", "累计"),
                  children: text(video.latest?.[key as keyof LiveMetrics]),
                })),
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}
