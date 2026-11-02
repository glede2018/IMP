import { useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  List,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACCOUNT_TYPES,
  compact,
  demoAccounts,
  demoTemplates,
  money,
  number,
  rate,
} from "@/services/analytics-demo";
import type { DemoAnalytics, VideoRow } from "@/services/analytics-demo";

const { Text } = Typography;
export type Stat = {
  title: string;
  value: string | number;
  detail?: ReactNode;
  change?: string;
};
export function Stats({ items }: { items: Stat[] }) {
  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.title} xs={24} sm={12} xl={6}>
          <Card className="dc-stat">
            <Statistic title={item.title} value={item.value} />
            <div className="dc-stat-detail">
              {item.change && (
                <Text
                  className={
                    item.change.startsWith("-") ? "dc-negative" : "dc-positive"
                  }
                >
                  {item.change.startsWith("-") ? (
                    <ArrowDownOutlined />
                  ) : (
                    <ArrowUpOutlined />
                  )}{" "}
                  {item.change.replace("-", "")} 较上期
                  <br />
                </Text>
              )}
              {item.detail}
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
export function Panel({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="dc-panel" title={title} extra={extra}>
      {children}
    </Card>
  );
}
function Funnel({
  rows,
  footer,
}: {
  rows: { label: string; value: number }[];
  footer: ReactNode;
}) {
  return (
    <div className="dc-funnel">
      {rows.map((r) => (
        <div className="dc-funnel-row" key={r.label}>
          <div className="dc-funnel-label">
            <span>{r.label}</span>
            <strong>{number(r.value)}</strong>
          </div>
          <Progress
            percent={rows[0].value ? (r.value / rows[0].value) * 100 : 0}
            showInfo={false}
            strokeColor="#edbd94"
            trailColor="#f7f3ee"
            strokeWidth={24}
          />
        </div>
      ))}
      <div className="dc-footnote">{footer}</div>
    </div>
  );
}
function RankList({
  rows,
  onClick,
}: {
  rows: { id: string; name: string; subtitle: string; value: string }[];
  onClick?: (id: string) => void;
}) {
  return (
    <List
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="所选范围暂无演示数据"
          />
        ),
      }}
      dataSource={rows}
      renderItem={(r, i) => (
        <List.Item extra={<strong>{r.value}</strong>}>
          <Space align="start">
            <Text className="dc-rank">{String(i + 1).padStart(2, "0")}</Text>
            <div>
              {onClick ? (
                <Button
                  type="link"
                  className="dc-text-button"
                  onClick={() => onClick(r.id)}
                >
                  {r.name}
                </Button>
              ) : (
                <Text>{r.name}</Text>
              )}
              <div>
                <Text type="secondary">{r.subtitle}</Text>
              </div>
            </div>
          </Space>
        </List.Item>
      )}
    />
  );
}
export function VideoTable({
  videos,
  onPreview,
}: {
  videos: VideoRow[];
  onPreview: (v: VideoRow) => void;
}) {
  return (
    <Table
      rowKey="id"
      size="middle"
      dataSource={videos}
      scroll={{ x: 850 }}
      pagination={{
        pageSize: 5,
        hideOnSinglePage: true,
        showSizeChanger: false,
      }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无关联视频"
          />
        ),
      }}
      columns={[
        {
          title: "视频 / 模板",
          key: "video",
          width: 300,
          render: (_, v: VideoRow) => {
            const t = demoTemplates.find((t) => t.id === v.templateId);
            return (
              <Space>
                <Avatar
                  shape="square"
                  size={48}
                  className="dc-video-cover"
                  icon={<PlayCircleOutlined />}
                />
                <div>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => onPreview(v)}
                  >
                    {v.title}
                  </Button>
                  <div>
                    <Text type="secondary">
                      {t?.name} · {t?.version}
                    </Text>
                  </div>
                </div>
              </Space>
            );
          },
        },
        {
          title: "发布账号",
          key: "account",
          width: 155,
          render: (_, v) =>
            demoAccounts.find((a) => a.id === v.accountId)?.name,
        },
        {
          title: "发布时间",
          dataIndex: "publishedAt",
          width: 145,
          render: (v: string) => v.slice(5),
        },
        {
          title: "期间播放",
          key: "views",
          sorter: (a, b) => a.metrics.views - b.metrics.views,
          render: (_, v) => compact(v.metrics.views),
        },
        {
          title: "点赞率",
          key: "likes",
          render: (_, v) => rate(v.metrics.likes, v.metrics.views),
        },
        {
          title: "评论率",
          key: "comments",
          render: (_, v) => rate(v.metrics.comments, v.metrics.views),
        },
        {
          title: "分享率",
          key: "shares",
          render: (_, v) => rate(v.metrics.shares, v.metrics.views),
        },
      ]}
    />
  );
}
export function VideoDetail({
  video,
  onClose,
}: {
  video: VideoRow | null;
  onClose: () => void;
}) {
  const template = demoTemplates.find((t) => t.id === video?.templateId);
  return (
    <Drawer title="视频明细" open={!!video} onClose={onClose} width={560}>
      {video && (
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="演示视频记录"
            description="当前没有接入真实视频文件，暂不提供播放。所有指标均为虚拟数据。"
          />
          <Descriptions
            column={1}
            items={[
              { key: "title", label: "视频名称", children: video.title },
              { key: "id", label: "平台视频 ID", children: video.id },
              {
                key: "account",
                label: "发布账号",
                children: demoAccounts.find((a) => a.id === video.accountId)
                  ?.name,
              },
              { key: "date", label: "发布时间", children: video.publishedAt },
              {
                key: "template",
                label: "关联模板",
                children: `${template?.name} · ${template?.version}`,
              },
              {
                key: "tag",
                label: "匹配 tag",
                children: <Tag color="orange">{video.tag}</Tag>,
              },
              {
                key: "views",
                label: "期间播放",
                children: number(video.metrics.views),
              },
              {
                key: "likes",
                label: "期间点赞",
                children: number(video.metrics.likes),
              },
              {
                key: "comments",
                label: "期间评论",
                children: number(video.metrics.comments),
              },
              {
                key: "shares",
                label: "期间分享",
                children: number(video.metrics.shares),
              },
            ]}
          />
          <Text type="secondary">
            模板通过 tag
            关联；示例作品关联仅用于展示生产漏斗，真实作品关联后续接入。交易数据暂不归因到视频和模板。
          </Text>
        </Space>
      )}
    </Drawer>
  );
}
export function ContentOverview({
  data,
  cohort,
  change,
  onAccount,
  onTemplate,
  onPreview,
}: {
  data: DemoAnalytics;
  cohort: DemoAnalytics;
  change: (metric: "views" | "published" | "fans") => string | undefined;
  onAccount: (id: string) => void;
  onTemplate: (id: string) => void;
  onPreview: (v: VideoRow) => void;
}) {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Stats
        items={[
          {
            title: "成功发布视频",
            value: number(data.published.length),
            detail: `生成作品 ${cohort.works.length} · 发布账号 ${data.participating}`,
            change: change("published"),
          },
          {
            title: "视频播放量",
            value: compact(data.metrics.views),
            detail: "期间新增播放，包含历史视频",
            change: change("views"),
          },
          {
            title: "点赞 · 评论 · 分享",
            value: compact(
              data.metrics.likes + data.metrics.comments + data.metrics.shares,
            ),
            detail: `赞 ${compact(data.metrics.likes)} · 评 ${number(data.metrics.comments)} · 分享 ${number(data.metrics.shares)}`,
          },
          {
            title: "期间净增粉丝",
            value: `${data.netFans > 0 ? "+" : ""}${number(data.netFans)}`,
            detail: `期末粉丝总数 ${data.fans === null ? "—" : compact(data.fans)}`,
            change: change("fans"),
          },
        ]}
      />
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={12}>
          <Panel title="内容生产漏斗" extra={<Tag>同批作品 · 去重</Tag>}>
            <Funnel
              rows={[
                { label: "生成成功作品", value: cohort.works.length },
                { label: "已发布作品", value: cohort.worksPublished.length },
                { label: "有播放的作品", value: cohort.worksPlayed.length },
              ]}
              footer={
                <>
                  <div>
                    发布率{" "}
                    {rate(cohort.worksPublished.length, cohort.works.length)} ·
                    发布后有播放{" "}
                    {rate(
                      cohort.worksPlayed.length,
                      cohort.worksPublished.length,
                    )}
                  </div>
                  <div>
                    所选期间生成的全租户作品，观察至期末；不受账号筛选影响。演示作品关联，真实关联待接入。
                  </div>
                </>
              }
            />
          </Panel>
        </Col>
        <Col xs={24} xl={12}>
          <Panel
            title="内容传播趋势"
            extra={<Text type="secondary">期间新增播放</Text>}
          >
            <div className="dc-chart">
              {data.trend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend}>
                    <CartesianGrid vertical={false} stroke="#f0ece6" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={compact}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      formatter={(v: number) => [number(v), "新增播放"]}
                    />
                    <Bar
                      dataKey="views"
                      fill="#e9b78f"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty
                  description="所选日期暂无演示数据"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </div>
          </Panel>
        </Col>
      </Row>
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={8}>
          <Panel title="职人内容排行" extra={<Tag>TOP 3</Tag>}>
            <RankList
              onClick={onAccount}
              rows={data.accountRows
                .filter((a) => a.type === "personal_ip")
                .slice(0, 3)
                .map((a) => ({
                  id: a.id,
                  name: a.name,
                  subtitle: `${a.published} 条发布 · ${a.store}`,
                  value: `${compact(a.metrics.views)} 播放`,
                }))}
            />
          </Panel>
        </Col>
        <Col xs={24} xl={8}>
          <Panel title="热门模板" extra={<Tag>TOP 3</Tag>}>
            <RankList
              onClick={onTemplate}
              rows={data.templateRows
                .filter((t) => t.videoCount > 0)
                .slice(0, 3)
                .map((t) => ({
                  id: t.id,
                  name: t.name,
                  subtitle: `${t.version} · ${t.published} 条发布 · ${t.accounts} 个账号`,
                  value: compact(t.metrics.views),
                }))}
            />
          </Panel>
        </Col>
        <Col xs={24} xl={8}>
          <Panel title="优秀视频" extra={<Tag>TOP 3</Tag>}>
            <List
              dataSource={[...data.videos]
                .sort((a, b) => b.metrics.views - a.metrics.views)
                .slice(0, 3)}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
              }}
              renderItem={(v) => (
                <List.Item>
                  <Space>
                    <Avatar
                      shape="square"
                      size={44}
                      className="dc-video-cover"
                      icon={<PlayCircleOutlined />}
                    />
                    <div>
                      <Button
                        className="dc-text-button"
                        type="link"
                        onClick={() => onPreview(v)}
                      >
                        {v.title}
                      </Button>
                      <div>
                        <Text type="secondary">
                          {demoAccounts.find((a) => a.id === v.accountId)?.name}{" "}
                          · {compact(v.metrics.views)} 播放
                        </Text>
                      </div>
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          </Panel>
        </Col>
      </Row>
      <Alert
        type="info"
        message="创作待办（独立演示状态）"
        description="待生成 6 · 生成失败 2 · 待发布 16。人工发布到抖音；待办不随本页筛选变化，未连接任务或分发服务。"
        showIcon
      />
    </Space>
  );
}
export function BusinessOverview({ data }: { data: DemoAnalytics }) {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Stats
        items={[
          {
            title: "已归因支付订单",
            value: number(data.paidCount),
            detail: "按支付发生时间统计",
          },
          {
            title: "已归因成交金额",
            value: money(data.paidAmount),
            detail: `退款 ${money(data.refundAmount)} 单独列示`,
          },
          {
            title: "已归因核销券数",
            value: number(data.redeemedCount),
            detail: "按核销发生时间统计",
          },
          {
            title: "已归因核销金额",
            value: money(data.redeemedAmount),
            detail: "按券实付分摊金额统计",
          },
        ]}
      />
      <Alert
        type="info"
        showIcon
        message="账号级归因演示"
        description={`支付和核销按各自发生时间统计；${data.unattributed === null ? "账号或类型筛选下无法分配未归因订单" : `另有 ${data.unattributed} 笔未归因支付订单，未计入上方指标`}。核销券数不代表到店人数。`}
      />
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={12}>
          <Panel title="交易履约漏斗" extra={<Tag>同批券 · 观察至期末</Tag>}>
            <Funnel
              rows={[
                { label: "已支付有效券", value: data.coupons },
                { label: "其中已核销券", value: data.redeemedCohort },
              ]}
              footer={
                <>
                  <div>
                    同批券核销率 {rate(data.redeemedCohort, data.coupons)} ·
                    待核销 {number(data.coupons - data.redeemedCohort)} 张
                  </div>
                  <div>
                    所选期间支付的已归因券，剔除截至期末已退款券；与上方“期间发生核销”口径不同。
                  </div>
                </>
              }
            />
          </Panel>
        </Col>
        <Col xs={24} xl={12}>
          <Panel title="职人带货贡献排行" extra={<Tag>按成交金额</Tag>}>
            <RankList
              rows={data.orderRows
                .filter((a) => a.type === "personal_ip")
                .slice(0, 3)
                .map((a) => ({
                  id: a.id,
                  name: a.name,
                  subtitle: `${a.orders} 笔支付订单 · ${a.redeemed} 张核销券`,
                  value: money(a.amount),
                }))}
            />
            <div className="dc-footnote">
              仅统计平台明确归属的订单，视频与模板交易归因暂未接入。
            </div>
          </Panel>
        </Col>
      </Row>
    </Space>
  );
}
export function AccountPanel({
  data,
  selected,
  onSelect,
  onPreview,
}: {
  data: DemoAnalytics;
  selected: string | null;
  onSelect: (id: string) => void;
  onPreview: (v: VideoRow) => void;
}) {
  const selectedAccount =
    data.accountRows.find((a) => a.id === selected) || data.accountRows[0];
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Stats
        items={[
          {
            title: "参与发布账号",
            value: data.participating,
            detail: `品牌 ${data.accountRows.filter((a) => a.type === "brand" && a.published).length} · 职人 ${data.accountRows.filter((a) => a.type === "personal_ip" && a.published).length} · 门店 ${data.accountRows.filter((a) => a.type === "store_ip" && a.published).length}`,
          },
          {
            title: "期间新增播放",
            value: compact(data.metrics.views),
            detail: "已回传的视频演示数据",
          },
          {
            title: "点赞数",
            value: compact(data.metrics.likes),
            detail: `评论 ${number(data.metrics.comments)} · 分享 ${number(data.metrics.shares)}`,
          },
          {
            title: "净增粉丝",
            value: `${data.netFans > 0 ? "+" : ""}${number(data.netFans)}`,
            detail: `期末粉丝总数 ${data.fans === null ? "—" : compact(data.fans)}`,
          },
        ]}
      />
      <Panel title="账号表现" extra={<Tag>按播放量降序</Tag>}>
        <Table
          rowKey="id"
          size="middle"
          dataSource={data.accountRows}
          rowClassName={(a) =>
            a.id === selectedAccount?.id ? "dc-selected-row" : ""
          }
          scroll={{ x: 850 }}
          pagination={{
            pageSize: 5,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
          columns={[
            {
              title: "账号",
              key: "name",
              width: 230,
              render: (_, a) => (
                <>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => onSelect(a.id)}
                  >
                    {a.name} ↓
                  </Button>
                  <div>
                    <Text type="secondary">
                      {ACCOUNT_TYPES[a.type]} · {a.store}
                    </Text>
                  </div>
                </>
              ),
            },
            { title: "发布数", dataIndex: "published" },
            {
              title: "期间播放",
              key: "views",
              sorter: (a, b) => a.metrics.views - b.metrics.views,
              render: (_, a) => compact(a.metrics.views),
            },
            ...(["likes", "comments", "shares"] as const).map((key, i) => ({
              title: ["点赞", "评论", "分享"][i],
              key,
              render: (_: unknown, a: DemoAnalytics["accountRows"][number]) =>
                number(a.metrics[key]),
            })),
            {
              title: "净增粉丝",
              dataIndex: "netFans",
              render: (v: number) => `+${number(v)}`,
            },
          ]}
        />
        <div className="dc-footnote">
          点击账号查看视频；期间播放包含历史视频本期表现。收藏暂未接入。期末粉丝为账号粉丝数之和，不跨账号去重。
        </div>
      </Panel>
      <Panel
        title={
          selectedAccount ? `${selectedAccount.name} · 视频明细` : "视频明细"
        }
        extra={<Tag>期间新增表现</Tag>}
      >
        <VideoTable
          videos={data.videos.filter(
            (v) => v.accountId === selectedAccount?.id,
          )}
          onPreview={onPreview}
        />
        <div className="dc-footnote">
          各互动率 = 对应期间互动次数 ÷ 同期播放次数，非去重用户转化率。
        </div>
      </Panel>
    </Space>
  );
}
export function TemplatePanel({
  data,
  selected,
  onSelect,
  onPreview,
}: {
  data: DemoAnalytics;
  selected: string | null;
  onSelect: (id: string) => void;
  onPreview: (v: VideoRow) => void;
}) {
  const [sort, setSort] = useState("views");
  const template = data.templateRows.find((t) => t.id === selected);
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Stats
        items={[
          {
            title: "使用模板",
            value: data.templateRows.filter((t) => t.videoCount > 0).length,
            detail: "按已关联模板版本去重",
          },
          {
            title: "生成作品",
            value: data.works.length,
            detail: "全租户本期作品，不受账号筛选影响",
          },
          {
            title: "发布视频",
            value: data.published.length,
            detail: "按本期平台发布记录去重",
          },
          {
            title: "单视频平均播放",
            value: data.videos.length
              ? number(Math.round(data.metrics.views / data.videos.length))
              : "—",
            detail: `${compact(data.metrics.views)} 期间播放 / ${data.videos.length} 条统计视频（含历史视频）`,
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
              { label: "平均播放", value: "average" },
            ]}
          />
        }
      >
        <Table
          rowKey="id"
          size="middle"
          scroll={{ x: 1050 }}
          dataSource={[...data.templateRows].sort((a, b) =>
            sort === "views"
              ? b.metrics.views - a.metrics.views
              : b.average - a.average,
          )}
          pagination={{
            pageSize: 8,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          columns={[
            {
              title: "模板 / 版本",
              key: "name",
              width: 250,
              render: (_, t) => (
                <>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => onSelect(t.id)}
                  >
                    {t.name}
                  </Button>
                  <div>
                    <Text type="secondary">
                      {t.version} · {t.tag}
                    </Text>
                  </div>
                </>
              ),
            },
            { title: "生成作品数¹", dataIndex: "works" },
            { title: "本期发布数", dataIndex: "published" },
            { title: "统计视频数", dataIndex: "videoCount" },
            { title: "账号数", dataIndex: "accounts" },
            {
              title: "期间总播放",
              key: "views",
              render: (_, t) => compact(t.metrics.views),
            },
            { title: "平均播放", dataIndex: "average", render: number },
            {
              title: "点赞率",
              key: "likes",
              render: (_, t) => rate(t.metrics.likes, t.metrics.views),
            },
            {
              title: "评论率",
              key: "comments",
              render: (_, t) => rate(t.metrics.comments, t.metrics.views),
            },
          ]}
        />
        <div className="dc-footnote">
          按期间新增表现统计，总点赞 ÷
          总播放计算聚合点赞率。每个模板版本使用独立
          tag。¹生成作品按全租户统计，其他数据遵循账号筛选；低样本模板需结合账号与商品判断。
        </div>
      </Panel>
      <Panel
        title={
          template
            ? `${template.name} · ${template.version} · 关联视频`
            : "模板关联明细"
        }
        extra={
          template ? (
            <Button onClick={() => onSelect("")}>收起明细</Button>
          ) : undefined
        }
      >
        {template ? (
          <>
            <Space wrap className="dc-detail-tags">
              <Tag color="orange">{template.tag}</Tag>
              <Text type="secondary">
                关联 {template.accounts} 个账号 · {template.videoCount} 条视频
              </Text>
            </Space>
            <VideoTable
              videos={data.videos.filter((v) => v.templateId === template.id)}
              onPreview={onPreview}
            />
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="点击模板名称，查看关联账号与发布视频"
          />
        )}
      </Panel>
    </Space>
  );
}
export function OrderPanel({ data }: { data: DemoAnalytics }) {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="当前演示账号级归因：可查看账号带货贡献，视频与模板交易归因暂未接通。"
      />
      <Stats
        items={[
          {
            title: "已归因支付订单",
            value: number(data.paidCount),
            detail: "按支付时间统计",
          },
          {
            title: "已归因成交金额",
            value: money(data.paidAmount),
            detail: `退款金额 ${money(data.refundAmount)} 单独列示`,
          },
          {
            title: "已归因核销券数",
            value: number(data.redeemedCount),
            detail: "按核销时间统计",
          },
          {
            title: "未归因支付订单",
            value: data.unattributed === null ? "—" : number(data.unattributed),
            detail:
              data.unattributed === null
                ? "仅全部账号、全部类型下展示"
                : "单独展示，不分摊给职人",
          },
        ]}
      />
      <Panel title="账号带货贡献" extra={<Tag>演示数据 · 账号级归因</Tag>}>
        <Table
          rowKey="id"
          size="middle"
          dataSource={data.orderRows}
          scroll={{ x: 1000 }}
          pagination={{
            pageSize: 6,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          columns={[
            {
              title: "账号",
              key: "name",
              width: 210,
              render: (_, a) => (
                <>
                  {a.name}
                  <div>
                    <Text type="secondary">
                      {ACCOUNT_TYPES[a.type]} · {a.store}
                    </Text>
                  </div>
                </>
              ),
            },
            { title: "支付订单", dataIndex: "orders" },
            {
              title: "成交金额",
              dataIndex: "amount",
              render: money,
              sorter: (a, b) => a.amount - b.amount,
            },
            { title: "退款金额", dataIndex: "refund", render: money },
            { title: "核销券数", dataIndex: "redeemed" },
            { title: "核销金额", dataIndex: "redeemedAmount", render: money },
            {
              title: "归因层级",
              key: "level",
              render: () => <Tag>账号级</Tag>,
            },
          ]}
        />
        <div className="dc-footnote">
          仅展示平台已明确归属的订单。退款按退款成功时间统计，核销按核销时间统计，核销金额为券实付分摊金额。成交金额未扣退款。
        </div>
      </Panel>
      <Panel title="视频级成交与核销" extra={<Tag>暂未接入</Tag>}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <>
              <div>接通来源视频标识后，支持下钻到视频、商品及订单</div>
              <Text type="secondary">
                当前账号成交不会分摊到视频或模板，tag 不作为交易归因依据。
              </Text>
            </>
          }
        />
      </Panel>
    </Space>
  );
}
