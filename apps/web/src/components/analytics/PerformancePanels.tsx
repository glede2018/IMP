import InteractionMetric, {
  interactionKeys,
  interactionLabels,
  interactionRate,
} from "./InteractionMetric";
import { platformMap } from "@/services/api";
import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Modal,
  Row,
  Segmented,
  Space,
  Table,
} from "antd";
import VideoCoverButton from "./VideoCoverButton";
import dayjs from "dayjs";
import type { LiveOverview, LiveVideo } from "@/services/douyin-analytics";
import { Panel } from "./AnalyticsPanels";
import type { ReactNode } from "react";

const text = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("zh-CN");
const compact = (v: number | null | undefined) =>
  v == null
    ? "—"
    : Math.abs(v) >= 10000
      ? `${(v / 10000).toFixed(2).replace(/\.?0+$/, "")}万`
      : text(v);
const signed = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${text(v)}`;
function metricValue(
  metrics: LiveOverview["accounts"][number]["metrics"],
  key: keyof typeof metrics,
) {
  return key === "views" ? compact(metrics[key]) : text(metrics[key]);
}
const empty = (
  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
);
const pagination = {
  defaultPageSize: 10,
  pageSizeOptions: [10, 20, 50],
  showSizeChanger: true,
  showQuickJumper: true,
  hideOnSinglePage: false,
  showTotal: (total: number) => `共 ${total} 条`,
};
export function MetricCards({
  items,
}: {
  items: { title: string; value: ReactNode; detail?: ReactNode }[];
}) {
  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col xs={24} sm={12} xl={6} key={item.title}>
          <Card className="dc-performance-stat">
            <div className="dc-content-muted">{item.title}</div>
            <div className="dc-content-stat-value">{item.value}</div>
            <div className="dc-content-stat-detail">{item.detail}</div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
function VideoTable({
  videos,
  onVideo,
}: {
  videos: LiveVideo[];
  onVideo: (v: LiveVideo) => void;
}) {
  return (
    <Table<LiveVideo>
      rowKey="id"
      dataSource={videos}
      className="dc-video-details-table"
      tableLayout="fixed"
      pagination={pagination}
      locale={{ emptyText: empty }}
      columns={[
        {
          title: "视频 / 模板",
          key: "video",
          width: "28%",
          render: (_, v) => (
            <div>
              <div className="dc-video-details-title">
                <VideoCoverButton
                  video={v}
                  className="dc-performance-play"
                  onClick={() => onVideo(v)}
                />
                <Button
                  type="text"
                  className="dc-performance-video-title"
                  onClick={() => onVideo(v)}
                >
                  {v.title || "未命名视频"}
                </Button>
              </div>
              <div className="dc-content-muted dc-video-template">
                {v.template ? v.template.title : "—"}
              </div>
            </div>
          ),
        },
        {
          title: "发布时间",
          dataIndex: "publishedAt",
          width: "12%",
          render: (v: string) => dayjs(v).format("MM.DD HH:mm"),
        },
        {
          title: "播放量",
          key: "views",
          width: "8%",
          align: "right",
          render: (_, v) => compact(v.latest?.views),
        },
        ...interactionKeys.map((key) => ({
          title: interactionLabels[key],
          key,
          width: "13%",
          align: "right" as const,
          render: (_: unknown, v: LiveVideo) => (
            <InteractionMetric
              wrap
              count={v.latest?.[key]}
              rate={interactionRate(v.latest?.[key], v.latest?.views)}
            />
          ),
        })),
      ]}
    />
  );
}
export function AccountPerformance({
  data,
  selected,
  onSelect,
  onVideo,
}: {
  data?: LiveOverview;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onVideo: (v: LiveVideo) => void;
}) {
  const rows = [...(data?.accounts || [])].sort(
    (a, b) => (b.metrics.views ?? -Infinity) - (a.metrics.views ?? -Infinity),
  );
  const account = rows.find((a) => a.id === selected);
  const summary = data?.summary;
  return (
    <div className="dc-performance-stack">
      <MetricCards
        items={[
          {
            title: "参与发布账号",
            value: text(summary?.participating),
            detail: ["brand", "personal_ip", "store_ip"]
              .map(
                (type, i) =>
                  `${["品牌", "职人", "门店"][i]} ${rows.filter((a) => a.type === type && a.published > 0).length}`,
              )
              .join(" · "),
          },
          { title: "期间新增播放", value: compact(summary?.views) },
          {
            title: interactionLabels.likes,
            value: (
              <InteractionMetric
                compact
                count={summary?.likes}
                rate={summary?.rates.likes}
              />
            ),
            detail: (
              <Space wrap size={[12, 4]}>
                {interactionKeys
                  .filter((key) => key !== "likes")
                  .map((key) => (
                    <span key={key}>
                      {interactionLabels[key]}{" "}
                      <InteractionMetric
                        count={summary?.[key]}
                        rate={summary?.rates[key]}
                      />
                    </span>
                  ))}
              </Space>
            ),
          },
          {
            title: "净增粉丝",
            value: signed(summary?.netFans),
            detail: `期末粉丝总数 ${compact(summary?.fans)}`,
          },
        ]}
      />
      <Panel
        title="账号表现"
        extra={<span className="dc-performance-badge">按播放量降序</span>}
      >
        <Table<LiveOverview["accounts"][number]>
          rowKey="id"
          dataSource={rows}
          className="dc-account-performance-table"
          tableLayout="fixed"
          scroll={{ x: 1200 }}
          pagination={pagination}
          locale={{ emptyText: empty }}
          columns={[
            {
              title: "账号",
              key: "name",
              width: 280,
              align: "left",
              render: (_, a) => (
                <>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => onSelect(a.id)}
                  >
                    {a.name}
                  </Button>
                  <div className="dc-content-muted dc-table-subtitle">
                    {platformMap[a.platform as keyof typeof platformMap]} ·{" "}
                    {
                      (
                        {
                          brand: "品牌",
                          personal_ip: "职人",
                          store_ip: "门店",
                        } as Record<string, string>
                      )[a.type]
                    }
                    {a.store ? ` · ${a.store}` : ""}
                  </div>
                </>
              ),
            },
            {
              title: "发布数",
              dataIndex: "published",
              align: "center",
              width: 80,
            },
            {
              title: "播放量",
              key: "views",
              align: "center",
              width: 110,
              render: (_, a) => metricValue(a.metrics, "views"),
            },
            ...interactionKeys.map((key) => ({
              title: interactionLabels[key],
              key,
              align: "center" as const,
              width: 155,
              render: (_: unknown, a: LiveOverview["accounts"][number]) => (
                <InteractionMetric count={a.metrics[key]} rate={a.rates[key]} />
              ),
            })),
            {
              title: "净增粉丝",
              dataIndex: "netFans",
              align: "center",
              width: 110,
              render: signed,
            },
          ]}
        />
      </Panel>
      <Modal
        title={`${account?.name || "账号"} · 视频明细`}
        open={!!account}
        onCancel={() => onSelect(null)}
        footer={null}
        width={1440}
        className="dc-performance-page"
        styles={{ body: { maxHeight: "65dvh", overflowY: "auto" } }}
        destroyOnClose
      >
        <VideoTable
          key={account?.id}
          videos={(data?.videos || []).filter(
            (v) => v.accountId === account?.id,
          )}
          onVideo={onVideo}
        />
      </Modal>
    </div>
  );
}
export function TemplatePerformance({
  data,
  selected,
  onSelect,
  onVideo,
}: {
  data?: LiveOverview;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onVideo: (v: LiveVideo) => void;
}) {
  const [sort, setSort] = useState("views");
  const rows = [...(data?.templates || [])].sort((a, b) =>
    sort === "views"
      ? (b.metrics.views ?? -Infinity) - (a.metrics.views ?? -Infinity)
      : (b.average ?? -Infinity) - (a.average ?? -Infinity),
  );
  const template = rows.find((t) => t.id === selected);
  const measuredVideos = rows.reduce(
    (sum, row) => sum + row.metricCoverage.views,
    0,
  );
  const views = measuredVideos
    ? rows.reduce((sum, row) => sum + (row.metrics.views ?? 0), 0)
    : null;
  const published = rows.reduce((sum, row) => sum + row.published, 0);
  return (
    <div className="dc-performance-stack">
      <MetricCards
        items={[
          {
            title: "使用模板",
            value: text(
              data
                ? rows.filter((t) => t.videoCount > 0 || (t.works ?? 0) > 0)
                    .length
                : null,
            ),
            detail: "按模板统计",
          },
          {
            title: "生成作品",
            value: text(data?.content.generated),
            detail: "作品 ID 去重",
          },
          {
            title: "发布视频",
            value: text(data ? published : null),
            detail: "按平台发布记录去重",
          },
          {
            title: "单视频平均播放",
            value: text(
              views != null && measuredVideos > 0
                ? Math.round(views / measuredVideos)
                : null,
            ),
            detail: `${compact(views)}播放 / ${text(data ? measuredVideos : null)}条视频`,
          },
        ]}
      />
      <Panel
        title="模板效果排行"
        extra={
          <Segmented
            value={sort}
            onChange={(v) => setSort(String(v))}
            options={[
              { label: "总播放贡献", value: "views" },
              { label: "平均播放效率", value: "average" },
            ]}
          />
        }
      >
        <Table<LiveOverview["templates"][number]>
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 1450 }}
          pagination={pagination}
          locale={{ emptyText: empty }}
          columns={[
            {
              title: "模板",
              key: "title",
              width: 280,
              render: (_, t) => (
                <>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => onSelect(t.id)}
                  >
                    {t.title}
                  </Button>
                </>
              ),
            },
            {
              title: "作品数",
              dataIndex: "works",
              align: "right",
              render: text,
            },
            { title: "发布数", dataIndex: "published", align: "right" },
            { title: "账号数", dataIndex: "accounts", align: "right" },
            {
              title: "总播放",
              key: "views",
              align: "right",
              render: (_, t) => metricValue(t.metrics, "views"),
            },
            {
              title: "平均播放",
              dataIndex: "average",
              align: "right",
              render: text,
            },
            ...interactionKeys.map((key) => ({
              title: interactionLabels[key],
              key,
              align: "right" as const,
              width: 155,
              render: (_: unknown, t: LiveOverview["templates"][number]) => (
                <InteractionMetric count={t.metrics[key]} rate={t.rates[key]} />
              ),
            })),
          ]}
        />
      </Panel>
      <Modal
        title={`${template?.title || "模板"} · 视频明细`}
        open={!!template}
        onCancel={() => onSelect(null)}
        footer={null}
        width={1440}
        className="dc-performance-page"
        styles={{ body: { maxHeight: "65dvh", overflowY: "auto" } }}
        destroyOnClose
      >
        <VideoTable
          key={template?.id}
          videos={(data?.videos || []).filter(
            (v) => v.template?.id === template?.id,
          )}
          onVideo={onVideo}
        />
      </Modal>
    </div>
  );
}
export function OrderPerformance() {
  return (
    <div className="dc-performance-stack">
      <MetricCards
        items={[
          { title: "已归因支付订单", value: "—" },
          { title: "已归因成交金额", value: "—" },
          { title: "已归因核销券数", value: "—" },
          { title: "未归因支付订单", value: "—" },
        ]}
      />
      <Panel title="职人带货贡献">
        <Table
          rowKey="id"
          dataSource={[]}
          pagination={pagination}
          scroll={{ x: 950 }}
          locale={{ emptyText: empty }}
          columns={[
            { title: "职人账号", dataIndex: "name", width: 260 },
            ...[
              "支付订单",
              "成交金额",
              "退款金额",
              "核销券数",
              "核销金额",
              "归因层级",
            ].map((title, i) => ({
              title,
              key: String(i),
              align: "right" as const,
            })),
          ]}
        />
        <div className="dc-performance-detail">
          <div className="dc-performance-section-head">
            <h3>视频级成交与核销</h3>
          </div>
          <div className="dc-performance-placeholder">暂无数据</div>
        </div>
      </Panel>
    </div>
  );
}
export function BusinessPerformance() {
  return (
    <div className="dc-performance-stack">
      <Panel title="经营贡献">
        <Row className="dc-business-metrics" gutter={[24, 24]}>
          {[
            "已归因支付订单",
            "已归因成交金额",
            "已归因核销券数",
            "已归因核销金额",
          ].map((title) => (
            <Col xs={24} sm={12} xl={6} key={title}>
              <div className="dc-content-muted">{title}</div>
              <div className="dc-content-stat-value">—</div>
            </Col>
          ))}
        </Row>
      </Panel>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Panel title="交易履约漏斗">
            <div className="dc-business-funnel">
              {["已支付有效券", "其中已核销券"].map((label) => (
                <div className="dc-content-funnel-row" key={label}>
                  <span>{label}</span>
                  <strong>—</strong>
                </div>
              ))}
              <div className="dc-content-funnel-rates">
                <span>
                  同批券核销率 <b>—</b>
                </span>
                <span>
                  待核销 <b>—</b> 张
                </span>
              </div>
            </div>
          </Panel>
        </Col>
        <Col xs={24} xl={12}>
          <Panel
            title="职人带货贡献排行"
            extra={<span className="dc-content-muted">按成交金额</span>}
          >
            <List dataSource={[]} locale={{ emptyText: empty }} />
          </Panel>
        </Col>
      </Row>
    </div>
  );
}
