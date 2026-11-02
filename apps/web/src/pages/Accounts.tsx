import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Avatar,
  Input,
  Select,
  Modal,
  message,
} from "antd";
import {
  SearchOutlined,
  SlidersOutlined,
  PlayCircleOutlined,
  CaretRightOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import {
  fetchAccounts,
  platformMap,
  platformColorMap,
  tierMap,
  accountStatusMap,
  unbindAccount,
} from "@/services/ui-api";
import AccountDialog from "@/components/AccountDialog";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/services/ui-api";
import type { Account, AccountTier, Platform } from "@/types/ui";

/** 平台图标组件 */
const PlatformIcon = ({ platform }: { platform: Platform }) => {
  const color = platformColorMap[platform];
  return (
    <div
      className="w-5 h-5 rounded flex items-center justify-center text-white"
      style={{ background: color }}
    >
      <CaretRightOutlined style={{ fontSize: 10 }} />
    </div>
  );
};

/** 粉丝数格式化：超过 1 万显示 X.Xw */
function formatFans(fans?: number): string {
  if (fans === undefined) return "—";
  if (fans >= 10000) {
    return (fans / 10000).toFixed(1) + "w";
  }
  return fans.toLocaleString();
}

/**
 * 账号管理页
 * 矩阵账号的绑定、解绑、状态管理，对应 Design 原型 page-accounts
 */
export default function Accounts() {
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogTarget, setDialogTarget] = useState<Account | "new" | null>(
    null,
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("");
  const [tierFilter, setTierFilter] = useState<AccountTier | "">("");
  const [unbindTarget, setUnbindTarget] = useState<Account | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      setAccounts(await fetchAccounts());
    } catch (e) {
      reportError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const create = () => {
      if (canWrite) setDialogTarget("new");
      else message.info("当前账号没有编辑权限");
    };
    window.addEventListener("imp-account-create", create);
    return () => window.removeEventListener("imp-account-create", create);
  }, [canWrite]);

  useEffect(() => {
    const result = searchParams.get("douyin");
    if (!result) return;
    const texts: Record<string, string> = {
      connected: "抖音授权成功",
      demo: "本地演示授权已完成（非真实抖音授权）",
      cancelled: "已取消授权",
      conflict: "该账号已绑定，或与原授权账号不同",
      invalid: "授权请求已过期或不匹配，请重新发起",
      failed: "抖音授权未完成，请重试并检查应用配置",
      forbidden: "当前账号没有绑定权限",
    };
    const text = texts[result];
    if (text) {
      if (result === "connected") message.success(text);
      else if (["demo", "cancelled"].includes(result)) message.info(text);
      else message.error(text);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("douyin");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 过滤
  const filtered = accounts.filter((a) => {
    const matchKeyword =
      !keyword || a.nickname.includes(keyword) || a.accountId.includes(keyword);
    const matchPlatform = !platformFilter || a.platform === platformFilter;
    const matchTier = !tierFilter || a.tier === tierFilter;
    return matchKeyword && matchPlatform && matchTier;
  });

  // 平台统计（按平台聚合 + 按阶梯细分）
  const platformStats = useMemo(() => {
    const platforms: Platform[] = [
      "douyin",
      "xiaohongshu",
      "kuaishou",
      "shipinhao",
    ];
    return platforms
      .map((p) => {
        const list = accounts.filter((a) => a.platform === p);
        return {
          platform: p,
          label: platformMap[p],
          color: platformColorMap[p],
          count: list.length,
          brand: list.filter((a) => a.tier === "brand").length,
          personalIp: list.filter((a) => a.tier === "personal_ip").length,
          storeIp: list.filter((a) => a.tier === "store_ip").length,
        };
      })
      .filter((s) => s.count > 0);
  }, [accounts]);

  // 解绑确认
  const handleUnbind = async () => {
    if (!unbindTarget) return;
    try {
      await unbindAccount(unbindTarget.id);
    } catch (e) {
      reportError(e);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== unbindTarget.id));
    message.success(`已解绑「${unbindTarget.nickname}」`);
    setUnbindTarget(null);
  };

  const columns = [
    {
      title: "账号名称",
      dataIndex: "nickname",
      key: "nickname",
      render: (_: string, record: Account) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.avatar}
            style={{
              background: "var(--yp-primary-100)",
              color: "var(--yp-primary-700)",
            }}
          >
            {record.nickname.slice(0, 1)}
          </Avatar>
          <div>
            <div
              className="yp-font-medium"
              style={{ color: "var(--yp-neutral-900)" }}
            >
              {record.nickname}
            </div>
            <div
              className="yp-text-xs"
              style={{ color: "var(--yp-neutral-500)" }}
            >
              ID: {record.accountId}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "归属阶梯",
      dataIndex: "tier",
      key: "tier",
      render: (tier: AccountTier) => {
        const t = tierMap[tier];
        return <span className={`yp-tag ${t.tagClass}`}>{t.label}</span>;
      },
    },
    {
      title: "所属平台",
      dataIndex: "platform",
      key: "platform",
      render: (platform: Platform) => (
        <div className="flex items-center gap-2">
          <PlatformIcon platform={platform} />
          <span className="text-sm" style={{ color: "var(--yp-neutral-800)" }}>
            {platformMap[platform]}
          </span>
        </div>
      ),
    },
    {
      title: "粉丝数",
      dataIndex: "fans",
      key: "fans",
      render: (_: number, record: Account) => (
        <div>
          <div
            className="yp-font-medium"
            style={{ color: "var(--yp-neutral-900)" }}
          >
            {formatFans(record.fans)}
          </div>
          <div
            className="yp-text-xs"
            style={{
              color:
                (record.monthlyGrowth ?? 0) >= 0
                  ? "var(--yp-state-success)"
                  : "var(--yp-state-error)",
            }}
          >
            月增 {(record.monthlyGrowth ?? 0) >= 0 ? "+" : ""}
            {record.monthlyGrowth ?? "—"}
            {record.monthlyGrowth === undefined ? "" : "w"}
          </div>
        </div>
      ),
    },
    {
      title: "绑定状态",
      dataIndex: "status",
      key: "status",
      render: (status: Account["status"], record: Account) => {
        const s =
          record.authorization?.mode === "demo"
            ? { ...accountStatusMap.warning, label: "演示授权" }
            : accountStatusMap[status];
        return (
          <div className="flex items-center gap-2">
            <span className={`yp-status-dot ${s.dotClass}`} />
            <span className={`yp-tag ${s.tagClass}`}>{s.label}</span>
          </div>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: Account) => (
        <Space size={16}>
          <Button
            type="link"
            size="small"
            onClick={() => setDialogTarget(record)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => setUnbindTarget(record)}
          >
            解绑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="yp-page-header">
        <h1>账号管理</h1>
        <p>管理各平台矩阵账号的绑定与状态</p>
      </div>

      {/* 平台概览统计卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {platformStats.map((s) => (
          <div key={s.platform} className="yp-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                  style={{ background: s.color }}
                >
                  <CaretRightOutlined />
                </div>
                <span
                  className="yp-font-semibold"
                  style={{ color: "var(--yp-neutral-900)" }}
                >
                  {s.label}账号
                </span>
              </div>
              <span className="yp-tag yp-tag-primary">{s.count} 个</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--yp-neutral-50)" }}
              >
                <div
                  className="yp-text-lg yp-font-bold"
                  style={{ color: "var(--yp-neutral-900)" }}
                >
                  {s.brand}
                </div>
                <div
                  className="yp-text-xs mt-1"
                  style={{ color: "var(--yp-neutral-500)" }}
                >
                  品牌号
                </div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--yp-neutral-50)" }}
              >
                <div
                  className="yp-text-lg yp-font-bold"
                  style={{ color: "var(--yp-neutral-900)" }}
                >
                  {s.personalIp}
                </div>
                <div
                  className="yp-text-xs mt-1"
                  style={{ color: "var(--yp-neutral-500)" }}
                >
                  个人 IP
                </div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--yp-neutral-50)" }}
              >
                <div
                  className="yp-text-lg yp-font-bold"
                  style={{ color: "var(--yp-neutral-900)" }}
                >
                  {s.storeIp}
                </div>
                <div
                  className="yp-text-xs mt-1"
                  style={{ color: "var(--yp-neutral-500)" }}
                >
                  门店 IP
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            placeholder="全部平台"
            value={platformFilter || undefined}
            onChange={(v) => setPlatformFilter(v || "")}
            style={{ width: 144 }}
            allowClear
            options={[
              { value: "douyin", label: "抖音" },
              { value: "kuaishou", label: "快手" },
              { value: "xiaohongshu", label: "小红书" },
              { value: "shipinhao", label: "视频号" },
            ]}
          />
          <Select
            placeholder="全部阶梯"
            value={tierFilter || undefined}
            onChange={(v) => setTierFilter(v || "")}
            style={{ width: 144 }}
            allowClear
            options={[
              { value: "brand", label: "品牌号" },
              { value: "personal_ip", label: "个人 IP" },
              { value: "store_ip", label: "门店 IP" },
            ]}
          />
          <Input
            prefix={
              <SearchOutlined style={{ color: "var(--yp-neutral-400)" }} />
            }
            placeholder="搜索账号名称、ID"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 224 }}
          />
        </div>
        <Button icon={<SlidersOutlined />}>高级筛选</Button>
      </div>

      {/* 数据表格 */}
      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          pagination={{
            pageSize: 8,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条记录，每页 8 条`,
          }}
          expandable={{
            expandedRowRender: (record) =>
              record.topWorks && record.topWorks.length > 0 ? (
                <div
                  className="px-6 py-4"
                  style={{ background: "var(--yp-primary-50)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <RiseOutlined style={{ color: "var(--yp-primary-600)" }} />
                    <span
                      className="yp-text-sm yp-font-semibold"
                      style={{ color: "var(--yp-primary-800)" }}
                    >
                      TOP3 作品
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {record.topWorks.map((work, idx) => (
                      <div key={idx} className="yp-card p-3 flex gap-3">
                        <div
                          className="w-20 h-14 rounded flex items-center justify-center flex-shrink-0"
                          style={{ background: "var(--yp-neutral-200)" }}
                        >
                          <PlayCircleOutlined
                            style={{
                              fontSize: 24,
                              color: "var(--yp-neutral-400)",
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="yp-text-sm yp-font-medium truncate"
                            style={{ color: "var(--yp-neutral-900)" }}
                          >
                            {work.title}
                          </div>
                          <div
                            className="flex items-center gap-1 mt-1 yp-text-xs"
                            style={{ color: "var(--yp-neutral-500)" }}
                          >
                            <CaretRightOutlined style={{ fontSize: 12 }} />
                            <span>{work.views}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="px-6 py-4 yp-text-xs"
                  style={{
                    background: "var(--yp-primary-50)",
                    color: "var(--yp-neutral-500)",
                  }}
                >
                  暂无作品数据
                </div>
              ),
            rowExpandable: () => true,
          }}
        />
      </Card>

      <AccountDialog
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        onSaved={() => void loadData()}
      />
      {/* 解绑确认弹窗 */}
      <Modal
        title="解绑账号"
        open={!!unbindTarget}
        onOk={handleUnbind}
        onCancel={() => setUnbindTarget(null)}
        okText="确认解绑"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <p style={{ marginBottom: 8 }}>
          确定要解绑账号「<strong>{unbindTarget?.nickname}</strong>」吗？
        </p>
        <p style={{ color: "var(--yp-neutral-500)", fontSize: 13, margin: 0 }}>
          {unbindTarget?.authorization?.mode === "live"
            ? "解绑会删除本系统保存的授权凭证。如需撤销抖音侧授权，请在抖音“设置 → 账号与安全 → 授权管理”中取消。"
            : "解绑后将移除本系统中的账号记录。"}
        </p>
      </Modal>
    </div>
  );
}
