import VideoCoverButton from "./VideoCoverButton";
import { Button, Card, Col, Empty, List, Row } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import type { LiveOverview, LiveVideo } from "@/services/douyin-analytics";
import { Panel } from "./AnalyticsPanels";

const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("zh-CN");
const compact = (v: number | null | undefined) =>
  v == null
    ? "—"
    : Math.abs(v) >= 10000
      ? `${(v / 10000).toFixed(1).replace(/\.0$/, "")}万`
      : number(v);
const sum = (...values: (number | null | undefined)[]) =>
  values.some((v) => v == null)
    ? null
    : values.reduce<number>((a, b) => a + b!, 0);
const rate = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || !b ? "—" : `${((a / b) * 100).toFixed(1)}%`;
function Comparison({
  value,
  previous,
}: {
  value?: number | null;
  previous?: number | null;
}) {
  if (value == null || previous == null || previous === 0)
    return <div className="dc-content-comparison">— 较上期</div>;
  const change = ((value - previous) / Math.abs(previous)) * 100;
  return (
    <div
      className={`dc-content-comparison ${change >= 0 ? "is-positive" : "is-negative"}`}
    >
      {change >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{" "}
      {Math.abs(change).toFixed(1)}% 较上期
    </div>
  );
}
type Rank = {
  id: string;
  name: string;
  subtitle: string;
  value: number | null;
  video?: LiveVideo;
};
function Ranking({
  rows,
  onSelect,
}: {
  rows: Rank[];
  onSelect: (row: Rank) => void;
}) {
  return (
    <List
      className="dc-content-ranks"
      dataSource={rows.slice(0, 3)}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
        ),
      }}
      renderItem={(row, index) => (
        <List.Item>
          <div className="dc-content-rank-row">
            {row.video ? (
              <VideoCoverButton video={row.video} className="dc-content-play" onClick={() => onSelect(row)} />
            ) : (
              <span className="dc-rank">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <div className="dc-content-rank-copy">
              <Button
                type="text"
                className="dc-content-rank-name"
                onClick={() => onSelect(row)}
              >
                {row.name}
              </Button>
              <div className="dc-content-muted">{row.subtitle}</div>
              <div className="dc-content-rank-value">
                {compact(row.value)}
                {!row.video && <span>播放</span>}
              </div>
            </div>
          </div>
        </List.Item>
      )}
    />
  );
}
export default function ContentOperations({
  data,
  onAccount,
  onTemplate,
  onVideo,
}: {
  data?: LiveOverview;
  onAccount: (id: string) => void;
  onTemplate: (id: string) => void;
  onVideo: (video: LiveVideo) => void;
}) {
  const summary = data?.summary;
  const content = data?.content;
  const accounts = data?.accounts || [];
  const videos = data?.videos || [];
  const trend = (content?.trend || []).map((r) => ({
    ...r,
    label: dayjs(r.date).format("MM.DD"),
    value: r.views == null ? null : r.views / 10000,
  }));
  const ranked = <T extends { metrics: { views: number | null } }>(rows: T[]) =>
    rows
      .filter((r) => r.metrics.views != null)
      .sort((a, b) => b.metrics.views! - a.metrics.views!);
  const funnel = [
    { label: "生成成功作品", value: content?.generated },
    { label: "已发布作品", value: content?.publishedWorks },
    { label: "有播放的作品", value: content?.playedWorks },
  ];
  return (
    <div className="dc-content-overview">
      <Row gutter={[16, 16]}>
        {[
          {
            title: "成功发布视频",
            value: number(summary?.published),
            suffix: "条",
            details: (
              <>
                <Comparison
                  value={summary?.published}
                  previous={content?.previous?.published}
                />
                <div className="dc-content-split">
                  <span>生成作品 {number(content?.generated)}</span>
                  <span>发布账号 {number(summary?.participating)}</span>
                </div>
              </>
            ),
          },
          {
            title: "视频播放量",
            value: compact(summary?.views),
            details: (
              <>
                <Comparison
                  value={summary?.views}
                  previous={content?.previous?.views}
                />
                <div>期间新增播放</div>
              </>
            ),
          },
          {
            title: "点赞 · 评论 · 分享",
            value: compact(
              sum(summary?.likes, summary?.comments, summary?.shares),
            ),
            details: (
              <>
                <div className="dc-content-split">
                  <span>赞 {compact(summary?.likes)}</span>
                  <span>评 {number(summary?.comments)}</span>
                </div>
                <div className="dc-content-split">
                  <span>分享 {number(summary?.shares)}</span>
                </div>
              </>
            ),
          },
          {
            title: "期间净增粉丝",
            value: `${summary?.netFans != null && summary.netFans > 0 ? "+" : ""}${number(summary?.netFans)}`,
            details: (
              <>
                <Comparison
                  value={summary?.netFans}
                  previous={content?.previous?.netFans}
                />
                <div>期末粉丝总数 {compact(summary?.fans)}</div>
              </>
            ),
          },
        ].map((item) => (
          <Col xs={24} sm={12} xl={6} key={item.title}>
            <Card className="dc-content-stat">
              <div className="dc-content-muted">{item.title}</div>
              <div className="dc-content-stat-value">
                {item.value}
                {item.suffix && <small>{item.suffix}</small>}
              </div>
              <div className="dc-content-stat-detail">{item.details}</div>
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Panel
            title="内容生产漏斗"
            extra={<span className="dc-content-muted">同批作品 · 去重</span>}
          >
            <div className="dc-content-funnel">
              {funnel.map((row) => (
                <div key={row.label} className="dc-content-funnel-row">
                  <div
                    className="dc-content-funnel-fill"
                    style={{
                      width:
                        row.value == null || !content?.generated
                          ? "0%"
                          : `${Math.min(100, (row.value / content.generated) * 100)}%`,
                    }}
                  />
                  <span>{row.label}</span>
                  <strong>{number(row.value)}</strong>
                </div>
              ))}
            </div>
            <div className="dc-content-funnel-rates">
              <span>
                发布率{" "}
                <b>{rate(content?.publishedWorks, content?.generated)}</b>
              </span>
              <span>
                发布后有播放{" "}
                <b>{rate(content?.playedWorks, content?.publishedWorks)}</b>
              </span>
            </div>
          </Panel>
        </Col>
        <Col xs={24} xl={12}>
          <Panel
            title="内容传播趋势"
            extra={<span className="dc-content-muted">新增播放 / 万次</span>}
          >
            <div className="dc-content-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trend}
                  margin={{ top: 28, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#f1eeea" />
                  <XAxis
                    dataKey="label"
                    axisLine={{ stroke: "#eeeae5" }}
                    tickLine={false}
                    tick={{ fill: "#948e86", fontSize: 12 }}
                  />
                  <YAxis
                    hide
                    domain={[0, (max: number) => Math.max(1, max * 1.25)]}
                  />
                  <Tooltip
                    cursor={{ fill: "#faf7f3" }}
                    formatter={(v: number) => [
                      `${number(v * 10000)} 次`,
                      "新增播放",
                    ]}
                  />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={44}>
                    {trend.map((r, i) => (
                      <Cell
                        key={r.date}
                        fill={i === trend.length - 1 ? "#df803d" : "#edbf99"}
                      />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: number | null) =>
                        v == null ? "" : v.toFixed(1)
                      }
                      fill="#948e86"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {!trend.some((r) => r.value != null) && (
                <div className="dc-content-chart-empty">暂无数据</div>
              )}
            </div>
          </Panel>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="dc-content-rank-grid">
        <Col xs={24} lg={8}>
          <Panel
            title="职人内容排行"
            extra={<span className="dc-content-muted">TOP 3</span>}
          >
            <Ranking
              rows={ranked(
                accounts.filter((a) => a.type === "personal_ip"),
              ).map((a) => ({
                id: a.id,
                name: a.name,
                subtitle: `${a.published} 条视频${a.store ? ` · ${a.store}` : ""}`,
                value: a.metrics.views,
              }))}
              onSelect={(r) => onAccount(r.id)}
            />
          </Panel>
        </Col>
        <Col xs={24} lg={8}>
          <Panel
            title="热门模板"
            extra={<span className="dc-content-muted">TOP 3</span>}
          >
            <Ranking
              rows={ranked(data?.templates || []).map((t) => ({
                id: t.id,
                name: t.title,
                subtitle: `${t.published} 条发布视频 · ${t.accounts} 个账号`,
                value: t.metrics.views,
              }))}
              onSelect={(r) => onTemplate(r.id)}
            />
          </Panel>
        </Col>
        <Col xs={24} lg={8}>
          <Panel
            title="优秀视频"
            extra={<span className="dc-content-muted">TOP 3</span>}
          >
            <Ranking
              rows={ranked(videos).map((v) => ({
                id: v.id,
                name: v.title || "未命名视频",
                subtitle: [
                  accounts.find((a) => a.id === v.accountId)?.name,
                  v.template?.title,
                ]
                  .filter(Boolean)
                  .join(" · "),
                value: v.metrics.views,
                video: v,
              }))}
              onSelect={(r) => r.video && onVideo(r.video)}
            />
          </Panel>
        </Col>
      </Row>
      <div className="dc-content-todos">
        <span>创作待办</span>
        <span>待生成 {number(content?.pending)}</span>
        <span>生成失败 {number(content?.failed)}</span>
        <span>待发布 {number(content?.pendingPublish)}</span>
      </div>
    </div>
  );
}
