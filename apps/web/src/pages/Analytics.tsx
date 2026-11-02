import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  DatePicker,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  ACCOUNT_TYPES,
  DEMO_PERIOD,
  demoAccounts,
  getDemoAnalytics,
} from "@/services/analytics-demo";
import type { VideoRow } from "@/services/analytics-demo";
import {
  AccountPanel,
  BusinessOverview,
  ContentOverview,
  OrderPanel,
  TemplatePanel,
  VideoDetail,
} from "@/components/analytics/AnalyticsPanels";
import "./analytics.css";

const tabs = [
  { key: "content", label: "内容运营" },
  { key: "business", label: "经营贡献" },
  { key: "accounts", label: "账号与视频" },
  { key: "templates", label: "模板效果" },
  { key: "orders", label: "订单与核销" },
];
export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const active = tabs.some((t) => t.key === params.get("tab"))
    ? params.get("tab")!
    : "content";
  const [period, setPeriod] = useState<[string, string]>([...DEMO_PERIOD]);
  const [account, setAccount] = useState("all");
  const [type, setType] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [start, end] = period;
  const data = useMemo(
    () => getDemoAnalytics(start, end, account, type),
    [start, end, account, type],
  );
  const cohort = useMemo(() => getDemoAnalytics(start, end), [start, end]);
  const days = dayjs(end).diff(dayjs(start), "day") + 1;
  const previousStart = dayjs(start).subtract(days, "day").format("YYYY-MM-DD");
  const previousEnd = dayjs(start).subtract(1, "day").format("YYYY-MM-DD");
  const previous = useMemo(
    () => getDemoAnalytics(previousStart, previousEnd, account, type),
    [previousStart, previousEnd, account, type],
  );
  const comparisonCovered =
    previousStart >= "2026-10-05" && end <= DEMO_PERIOD[1];
  const change = (metric: "views" | "published" | "fans") => {
    if (!comparisonCovered) return undefined;
    const now =
      metric === "views"
        ? data.metrics.views
        : metric === "published"
          ? data.published.length
          : data.netFans;
    const before =
      metric === "views"
        ? previous.metrics.views
        : metric === "published"
          ? previous.published.length
          : previous.netFans;
    return before > 0
      ? `${(((now - before) / before) * 100).toFixed(1)}%`
      : undefined;
  };
  const goTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    setParams(next, { replace: true });
  };
  const reset = () => {
    setPeriod([...DEMO_PERIOD]);
    setAccount("all");
    setType("all");
    setSelectedAccount(null);
    setSelectedTemplate(null);
  };
  const selectAccount = (id: string) => {
    setSelectedAccount(id);
    goTab("accounts");
  };
  const selectTemplate = (id: string) => {
    setSelectedTemplate(id);
    goTab("templates");
  };
  return (
    <div className="dc-page">
      <div className="yp-page-header dc-header">
        <div>
          <h1>数据中心</h1>
          <p>
            内容效果与带货贡献分析 · 从账号、视频和模板，找到值得复用的内容。
          </p>
        </div>
        <Tag color="orange">演示模式 · 全部为虚拟数据</Tag>
      </div>
      <div className="dc-filters">
        <Space wrap size={12}>
          <DatePicker.RangePicker
            aria-label="统计日期"
            allowClear={false}
            value={[dayjs(start), dayjs(end)]}
            onChange={(dates) => {
              if (dates?.[0] && dates[1])
                setPeriod([
                  dates[0].format("YYYY-MM-DD"),
                  dates[1].format("YYYY-MM-DD"),
                ]);
            }}
            presets={[
              {
                label: "演示近 7 天",
                value: [dayjs(DEMO_PERIOD[0]), dayjs(DEMO_PERIOD[1])],
              },
              {
                label: "演示近 14 天",
                value: [dayjs("2026-10-05"), dayjs(DEMO_PERIOD[1])],
              },
            ]}
          />
          <Select
            aria-label="矩阵账号"
            value={account}
            showSearch
            optionFilterProp="label"
            style={{ width: 205 }}
            onChange={setAccount}
            options={[
              { value: "all", label: "全部矩阵账号" },
              ...demoAccounts
                .filter((a) => type === "all" || a.type === type)
                .map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <Select
            aria-label="账号类型"
            value={type}
            style={{ width: 175 }}
            onChange={(v) => {
              setType(v);
              setAccount("all");
            }}
            options={[
              { value: "all", label: "品牌 / 职人 / 门店" },
              ...Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={reset}>
            重置
          </Button>
        </Space>
        <Typography.Text type="secondary">
          抖音演示数据 · 截至 10.18 · 同步示例 10.19 12:00
        </Typography.Text>
      </div>
      <Alert
        className="dc-demo-notice"
        type="info"
        showIcon
        message="当前仅展示前端虚拟数据，不调用抖音或交易接口。"
        description="可筛选演示日期 2026.10.05—10.18；其他日期暂无数据，跨出演示范围时仅汇总覆盖部分。账号和模板支持点击查看明细。"
      />
      <Tabs
        activeKey={active}
        onChange={goTab}
        items={tabs.map((tab) => ({
          ...tab,
          children:
            tab.key === active ? (
              <>
                {active === "content" && (
                  <ContentOverview
                    data={data}
                    cohort={cohort}
                    change={change}
                    onAccount={selectAccount}
                    onTemplate={selectTemplate}
                    onPreview={setVideo}
                  />
                )}
                {active === "business" && <BusinessOverview data={data} />}
                {active === "accounts" && (
                  <AccountPanel
                    data={data}
                    selected={selectedAccount}
                    onSelect={setSelectedAccount}
                    onPreview={setVideo}
                  />
                )}
                {active === "templates" && (
                  <TemplatePanel
                    data={data}
                    selected={selectedTemplate}
                    onSelect={setSelectedTemplate}
                    onPreview={setVideo}
                  />
                )}
                {active === "orders" && <OrderPanel data={data} />}
              </>
            ) : null,
        }))}
      />
      <VideoDetail video={video} onClose={() => setVideo(null)} />
    </div>
  );
}
