import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getPage } from "@/services/api";
import {
  addTrackingTag,
  enqueueSync,
  fetchLiveOverview,
  fetchSyncStatus,
  fetchTrackingTags,
  rematchTags,
} from "@/services/douyin-analytics";
import type {
  LiveMetrics,
  LiveVideo,
  LiveOverview,
} from "@/services/douyin-analytics";
import { Panel, Stats } from "./AnalyticsPanels";
const text = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("zh-CN");
const percent = (a: number | null, b: number | null) =>
  a == null || b == null || b <= 0 ? "—" : `${((a / b) * 100).toFixed(2)}%`;
const types: Record<string, string> = {
  brand: "品牌",
  personal_ip: "职人",
  store_ip: "门店",
};
const statuses: Record<string, string> = {
  idle: "待同步",
  queued: "已排队",
  running: "同步中",
  success: "已同步",
  partial: "部分同步",
  blocked: "待配置/授权",
  unsupported: "接口不可用",
  permission_required: "缺少权限",
  authorization_required: "需重新授权",
  rate_limited: "平台限流",
  network_error: "网络失败",
  failed: "重试中",
  awaiting_data: "等待平台产出",
  invalid_response: "平台响应异常",
  superseded: "等待重试",
};
const labels = {
  views: "期间播放",
  likes: "期间点赞",
  comments: "期间评论",
  shares: "期间分享",
};
export default function LiveAnalytics({ onDemo }: { onDemo: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { key: "content", label: "内容运营" },
    { key: "business", label: "经营贡献" },
    { key: "accounts", label: "账号与视频" },
    { key: "templates", label: "模板效果" },
    { key: "orders", label: "订单与核销" },
  ];
  const active = tabs.some((t) => t.key === params.get("tab"))
    ? params.get("tab")!
    : "content";
  const [period, setPeriod] = useState<[string, string]>([
    dayjs().subtract(6, "day").format("YYYY-MM-DD"),
    dayjs().format("YYYY-MM-DD"),
  ]);
  const [accountId, setAccountId] = useState("all");
  const [type, setType] = useState("all");
  const [detailAccount, setDetailAccount] = useState<string | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<string | null>(null);
  const [video, setVideo] = useState<LiveVideo | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagForm] = Form.useForm();
  const permitted = (p: string) =>
    !!user && (user.permissions.includes("*") || user.permissions.includes(p));
  const canSync = permitted("accounts:write"),
    canTag = permitted("templates:write") && permitted("templates");
  const status = useQuery({
    queryKey: ["douyin-sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 15000,
  });
  const overview = useQuery({
    queryKey: ["douyin-live-overview", period, accountId, type],
    queryFn: () =>
      fetchLiveOverview({ start: period[0], end: period[1], accountId, type }),
    refetchInterval: 30000,
  });
  const bindings = useQuery({
    queryKey: ["douyin-tracking-tags"],
    queryFn: fetchTrackingTags,
  });
  const templates = useQuery({
    queryKey: ["douyin-binding-templates"],
    queryFn: () =>
      getPage<{ id: string; title: string }>("/templates", { pageSize: 100 }),
    enabled: tagOpen && canTag,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["douyin-sync-status"] }),
      client.invalidateQueries({ queryKey: ["douyin-live-overview"] }),
      client.invalidateQueries({ queryKey: ["douyin-tracking-tags"] }),
      client.invalidateQueries({ queryKey: ["tags"] }),
    ]);
  };
  const visible = (status.data || []).filter(
    (a) =>
      (accountId === "all" || a.id === accountId) &&
      (type === "all" || a.type === type),
  );
  const sync = useMutation({
    mutationFn: async () => {
      for (const a of visible) await enqueueSync(a.id);
    },
    onSuccess: async () => {
      message.success("已检查授权并加入可用同步队列，后台将在一分钟内处理。");
      await refresh();
    },
    onError: (e: Error) => {
      message.error(e.message);
      void refresh();
    },
  });
  const add = useMutation({
    mutationFn: addTrackingTag,
    onSuccess: async () => {
      message.success("tag 已绑定；点击重新匹配可更新已同步视频。");
      setTagOpen(false);
      tagForm.resetFields();
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const rematch = useMutation({
    mutationFn: rematchTags,
    onSuccess: async (r) => {
      message.success(`已重新匹配 ${r.processed} 条视频`);
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const data = overview.data,
    summary = data?.summary;
  const accountRows = data?.accounts || [];
  const selectedAccount =
    accountRows.find((a) => a.id === detailAccount) || accountRows[0];
  const selectedTemplate = data?.templates.find((t) => t.id === detailTemplate);
  const videos = data?.videos || [];
  const metricColumns = (["views", "likes", "comments", "shares"] as const).map(
    (k) => ({
      title: labels[k],
      key: k,
      render: (_: unknown, r: { metrics: LiveMetrics }) => text(r.metrics[k]),
    }),
  );
  const videoTable = (rows: LiveVideo[]) => (
    <Table<LiveVideo>
      rowKey="id"
      scroll={{ x: 1050 }}
      pagination={{
        pageSize: 8,
        showSizeChanger: false,
        hideOnSinglePage: true,
      }}
      dataSource={rows}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚无已同步视频"
          />
        ),
      }}
      columns={[
        {
          title: "视频 / 模板",
          key: "title",
          width: 260,
          render: (_, v) => (
            <>
              <Button
                type="link"
                className="dc-text-button"
                onClick={() => setVideo(v)}
              >
                {v.title}
              </Button>
              <div>
                <Typography.Text type="secondary">
                  {v.template
                    ? `${v.template.title} · ${v.template.version}`
                    : v.matchStatus === "conflict"
                      ? "多个模板 tag 冲突"
                      : "未关联模板"}
                </Typography.Text>
              </div>
            </>
          ),
        },
        {
          title: "发布账号",
          key: "account",
          render: (_, v) =>
            accountRows.find((a) => a.id === v.accountId)?.name || "—",
        },
        {
          title: "发布时间",
          dataIndex: "publishedAt",
          render: (s: string) => dayjs(s).format("MM-DD HH:mm"),
        },
        ...metricColumns,
        {
          title: "点赞率",
          key: "rate",
          render: (_, v) => percent(v.metrics.likes, v.metrics.views),
        },
      ]}
    />
  );
  const templateTable = (
    <>
      <Panel
        title="模板效果排行"
        extra={
          canTag ? (
            <Space>
              <Button onClick={() => setTagOpen(true)}>绑定模板 tag</Button>
              <Button
                loading={rematch.isPending}
                onClick={() => rematch.mutate()}
              >
                重新匹配
              </Button>
            </Space>
          ) : undefined
        }
      >
        <Table<LiveOverview["templates"][number]>
          rowKey="id"
          scroll={{ x: 1050 }}
          dataSource={data?.templates || []}
          pagination={{
            pageSize: 8,
            hideOnSinglePage: true,
            showSizeChanger: false,
          }}
          columns={[
            {
              title: "模板 / 版本",
              key: "title",
              width: 260,
              render: (_, t) => (
                <>
                  <Button
                    type="link"
                    className="dc-text-button"
                    onClick={() => setDetailTemplate(t.id)}
                  >
                    {t.title}
                  </Button>
                  <div>
                    <Tag>{t.version}</Tag>#{t.tag}
                  </div>
                </>
              ),
            },
            { title: "本期发布数", dataIndex: "published" },
            { title: "统计视频数", dataIndex: "videoCount" },
            { title: "账号数", dataIndex: "accounts" },
            ...metricColumns,
            {
              title: "平均播放",
              dataIndex: "average",
              render: text,
              sorter: (a, b) => (a.average ?? -1) - (b.average ?? -1),
            },
          ]}
        />
        <div className="dc-footnote">
          每个 tag
          唯一对应一个模板版本，完整匹配；多模板标签冲突不自动分配。生成作品与发布作品的精确关联暂未接通。
        </div>
      </Panel>
      <Panel
        title={
          selectedTemplate
            ? `${selectedTemplate.title} · 关联视频`
            : "模板关联明细"
        }
      >
        {selectedTemplate ? (
          videoTable(
            videos.filter((v) => v.template?.id === selectedTemplate.id),
          )
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="点击模板名称查看关联账号和视频"
          />
        )}
      </Panel>
    </>
  );
  return (
    <div className="dc-page">
      <div className="yp-page-header dc-header">
        <div>
          <h1>数据中心</h1>
          <p>内容效果与带货贡献分析</p>
        </div>
        <Space>
          <Tag color="blue">真实数据 · 未接通的指标显示 —</Tag>
          <Button onClick={onDemo}>查看虚拟数据演示</Button>
        </Space>
      </div>
      <div className="dc-filters">
        <Space wrap>
          <DatePicker.RangePicker
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
            aria-label="矩阵账号"
            style={{ width: 200 }}
            value={accountId}
            options={[
              { value: "all", label: "全部矩阵账号" },
              ...(status.data || [])
                .filter((a) => type === "all" || a.type === type)
                .map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={setAccountId}
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
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
            刷新数据
          </Button>
          {canSync && (
            <Button
              icon={<SyncOutlined />}
              loading={sync.isPending}
              disabled={!visible.length || status.isError}
              onClick={() => sync.mutate()}
            >
              同步所选账号
            </Button>
          )}
        </Space>
        <Typography.Text type="secondary">
          最近视频采集：
          {data?.syncedAt
            ? dayjs(data.syncedAt).format("MM-DD HH:mm")
            : "尚未采集"}
        </Typography.Text>
      </div>
      <Alert
        type="info"
        showIcon
        message="先开通能力并正式授权，再采集真实数据"
        description={
          data?.basis ||
          "视频、粉丝独立同步；无权限、未授权及未采集不会以虚拟数据补齐。查询日期最多31天。"
        }
      />
      {(overview.error || status.error) && (
        <Alert
          type="error"
          showIcon
          message={overview.error?.message || status.error?.message}
          action={<Button onClick={() => void refresh()}>重试</Button>}
        />
      )}
      <Panel title="抖音同步状态">
        <Table
          size="small"
          rowKey="id"
          dataSource={visible}
          loading={status.isLoading}
          pagination={{
            pageSize: 5,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
          columns={[
            {
              title: "账号",
              key: "name",
              render: (_, a) => (
                <>
                  {a.name}
                  <div>
                    <Tag>
                      {a.mode === "live"
                        ? "正式授权"
                        : a.mode === "demo"
                          ? "演示授权"
                          : "未授权"}
                    </Tag>
                  </div>
                </>
              ),
            },
            ...["videos", "fans"].map((kind, i) => ({
              title: i ? "粉丝采集" : "视频采集",
              key: kind,
              render: (_: unknown, a: (typeof visible)[number]) => {
                const s = a.states.find((s) => s.kind === kind);
                return (
                  <>
                    <Tag
                      color={
                        s?.status === "success"
                          ? "green"
                          : s?.status === "running"
                            ? "blue"
                            : "orange"
                      }
                    >
                      {statuses[s?.status || "idle"] || s?.status}
                    </Tag>
                    <div>
                      <Typography.Text type="secondary">
                        {s?.message}
                      </Typography.Text>
                    </div>
                    {s?.lastSuccessAt && (
                      <Typography.Text type="secondary">
                        上次完成 {dayjs(s.lastSuccessAt).format("MM-DD HH:mm")}
                      </Typography.Text>
                    )}
                  </>
                );
              },
            })),
          ]}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚无抖音账号，请先在账号管理中绑定"
              />
            ),
          }}
        />
      </Panel>
      <Tabs
        activeKey={active}
        onChange={(key) => {
          const next = new URLSearchParams(params);
          next.set("tab", key);
          setParams(next, { replace: true });
        }}
        items={tabs}
      />
      {overview.isLoading ? (
        <Spin />
      ) : overview.isError ? null : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          {["content", "accounts", "templates"].includes(active) && (
            <Stats
              items={
                active === "templates"
                  ? [
                      {
                        title: "关联模板版本",
                        value: text(
                          data?.templates.filter((t) => t.videoCount > 0)
                            .length,
                        ),
                        detail: "以注册的唯一 tag 匹配",
                      },
                      {
                        title: "本期发布视频",
                        value: text(summary?.published),
                        detail: "平台视频 ID 去重",
                      },
                      {
                        title: "未关联 / 冲突视频",
                        value: `${text(summary?.unmatched)} / ${text(summary?.conflicts)}`,
                        detail: "不推测模板归属",
                      },
                      {
                        title: "快照基线覆盖",
                        value: `${text(summary?.measuredVideos)} / ${text(summary?.videoCount)}`,
                        detail: "平均播放使用同一统计视频集合",
                      },
                    ]
                  : [
                      {
                        title: "参与发布账号",
                        value: text(summary?.participating),
                        detail: `本期发布 ${text(summary?.published)} 条视频`,
                      },
                      {
                        title: "期间播放增量",
                        value: text(summary?.views),
                        detail: `基线覆盖 ${text(summary?.measuredVideos)} / ${text(summary?.videoCount)} 条视频`,
                      },
                      {
                        title: "期间点赞",
                        value: text(summary?.likes),
                        detail: `评论 ${text(summary?.comments)} · 分享 ${text(summary?.shares)}`,
                      },
                      {
                        title: "净增粉丝",
                        value: text(summary?.netFans),
                        detail: `期末观测粉丝总数 ${text(summary?.fans)}`,
                      },
                    ]
              }
            />
          )}
          {["content", "accounts"].includes(active) && (
            <>
              <Panel title="账号表现">
                <Table<LiveOverview["accounts"][number]>
                  rowKey="id"
                  dataSource={accountRows}
                  scroll={{ x: 1000 }}
                  pagination={{
                    pageSize: 8,
                    showSizeChanger: false,
                    hideOnSinglePage: true,
                  }}
                  columns={[
                    {
                      title: "账号",
                      key: "name",
                      width: 210,
                      render: (_, a) => (
                        <>
                          <Button
                            type="link"
                            className="dc-text-button"
                            onClick={() => setDetailAccount(a.id)}
                          >
                            {a.name} ↓
                          </Button>
                          <div>
                            <Typography.Text type="secondary">
                              {types[a.type]} · {a.store || "未关联门店"}
                            </Typography.Text>
                          </div>
                        </>
                      ),
                    },
                    { title: "发布数", dataIndex: "published" },
                    ...metricColumns,
                    { title: "净增粉丝", dataIndex: "netFans", render: text },
                  ]}
                />
                <div className="dc-footnote">
                  账号粉丝总量相加，不跨账号去重；快照差值为负可能来自平台修正或互动撤回，保留原值。
                </div>
              </Panel>
              <Panel
                title={
                  selectedAccount
                    ? `${selectedAccount.name} · 视频明细`
                    : "视频明细"
                }
              >
                {videoTable(
                  videos.filter((v) => v.accountId === selectedAccount?.id),
                )}
              </Panel>
              {active === "content" && (
                <Alert
                  type="info"
                  message="真实生产漏斗与待办暂未接入"
                  description="模板 tag 只能关联模板版本，不能确定单个生成作品的发布状态，因此暂不计算作品发布率。"
                />
              )}
            </>
          )}
          {active === "templates" && templateTable}
          {["business", "orders"].includes(active) && (
            <Panel title={active === "business" ? "经营贡献" : "订单与核销"}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  data?.trading.message || "生活服务交易数据暂未接入"
                }
              />
              <Alert
                type="info"
                message="需要独立开通生活服务商家应用与商家授权。当前不展示演示订单作为真实数据。"
              />
            </Panel>
          )}
        </Space>
      )}
      <Drawer
        title="视频明细"
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
              ]}
            />
            <Alert
              type="info"
              message="仅展示官方同步元信息，不将未经校验的外部地址嵌入播放器。交易暂不归因到视频。"
            />
          </>
        )}
      </Drawer>
      <Modal
        title="绑定模板版本 tag"
        open={tagOpen}
        onCancel={() => setTagOpen(false)}
        confirmLoading={add.isPending}
        onOk={() => tagForm.submit()}
        destroyOnClose
      >
        <Alert
          type="info"
          message="绑定后不可将同一 tag 改绑到其他模板或版本。请为新版本使用新的 tag。"
        />
        <Form
          form={tagForm}
          layout="vertical"
          onFinish={(values) => add.mutate(values)}
        >
          <Form.Item
            name="templateId"
            label="模板"
            rules={[{ required: true }]}
          >
            <Select
              loading={templates.isLoading}
              showSearch
              optionFilterProp="label"
              options={templates.data?.items.map((t) => ({
                value: t.id,
                label: t.title,
              }))}
            />
          </Form.Item>
          {templates.error && (
            <Alert type="error" message={templates.error.message} />
          )}
          <Form.Item
            name="version"
            label="版本"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={30} placeholder="例如 v1.0" />
          </Form.Item>
          <Form.Item
            name="tag"
            label="唯一 tag"
            rules={[{ required: true, whitespace: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择标签管理中已启用的发布 tag"
              options={(bindings.data || []).map((b) => ({
                value: b.tag,
                label: `#${b.tag}${b.templateId ? `（已绑定 ${b.version}）` : ""}`,
              }))}
            />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">
          已注册 {bindings.data?.length || 0} 个可用
          tag，与标签管理共用。保存后可重新匹配已有视频。
        </Typography.Text>
      </Modal>
    </div>
  );
}
