import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
} from "antd";
import {
  fetchStores,
  formatDate,
  platformMap,
  request,
  save,
  tierMap,
} from "@/services/api";
import type { Account, Store } from "@/types";
const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));
interface AuthorizationConfig {
  ready: boolean;
  reason: string;
  demoAvailable: boolean;
  scopes: string[];
}
export default function AccountDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Account | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [stores, setStores] = useState<Store[]>([]);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AuthorizationConfig | null>(null);
  const platform = Form.useWatch("platform", form);
  const isNewDouyin = target === "new" && platform === "douyin";
  const existing = target && target !== "new" ? target : null;
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    form.setFieldsValue(
      target === "new" ? { platform: "douyin", tier: "brand" } : target,
    );
    setConfig(null);
    fetchStores()
      .then(setStores)
      .catch((e) => message.error(e.message));
    request<AuthorizationConfig>("/oauth/douyin/config")
      .then(setConfig)
      .catch((e) => message.error(e.message));
  }, [target, form, message]);
  const authorize = async (mode: "live" | "demo") => {
    try {
      const values = await form.validateFields(["platform", "tier", "storeId"]);
      setBusy(true);
      const result = await save<{ authorizationUrl: string }>(
        "/oauth/douyin/start",
        {
          tier: values.tier,
          storeId: values.storeId || undefined,
          targetAccountId: existing?.id,
          mode,
        },
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      await save(
        target === "new" ? "/accounts" : `/accounts/${target!.id}`,
        {
          nickname: values.nickname,
          accountId: values.accountId,
          platform: values.platform,
          tier: values.tier,
          storeId: values.storeId ?? null,
        },
        target === "new" ? "POST" : "PUT",
      );
      message.success("账号档案已保存");
      onSaved();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await save(`/oauth/douyin/accounts/${existing.id}/refresh`, {});
      message.success("授权状态已更新");
      onSaved();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "状态更新失败");
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={target === "new" ? "绑定账号" : "账号信息"}
      open={!!target}
      onCancel={onClose}
      footer={
        <Space wrap>
          <Button onClick={onClose}>取消</Button>
          {platform === "douyin" && (
            <>
              {config?.demoAvailable &&
                (!existing ||
                  !existing.authorization ||
                  existing.authorization.mode === "demo") && (
                  <Button loading={busy} onClick={() => void authorize("demo")}>
                    本地演示授权
                  </Button>
                )}
              <Button
                type="primary"
                disabled={!config?.ready}
                loading={busy}
                onClick={() => void authorize("live")}
              >
                {existing?.authorization?.mode === "live"
                  ? "重新授权"
                  : "抖音扫码授权"}
              </Button>
              {existing?.authorization?.mode === "live" && (
                <Button loading={busy} onClick={() => void sync()}>
                  更新授权状态
                </Button>
              )}
            </>
          )}
          {!isNewDouyin && (
            <Button type="primary" loading={busy} onClick={() => form.submit()}>
              保存
            </Button>
          )}
        </Space>
      }
    >
      {platform === "douyin" ? (
        <Alert
          type={config?.ready ? "info" : "warning"}
          className="mb-4"
          message={
            config?.ready
              ? "通过抖音官方页面扫码授权，成功后自动获取昵称和头像。"
              : config?.reason || "正在检查抖音授权配置…"
          }
          description={
            config?.demoAvailable
              ? "本地演示不会连接抖音，也不会取得真实授权。"
              : undefined
          }
        />
      ) : (
        <Alert
          type="info"
          className="mb-4"
          message="此平台暂时只保存账号档案，授权后续接入。"
        />
      )}
      {existing?.authorization && (
        <div className="mb-4">
          <Tag
            color={
              existing.authorization.mode === "demo"
                ? "orange"
                : existing.status === "active"
                  ? "green"
                  : "red"
            }
          >
            {existing.authorization.mode === "demo"
              ? "本地演示授权 · 非真实抖音账号"
              : existing.status === "active"
                ? "抖音已授权"
                : "授权已失效"}
          </Tag>
          {existing.authorization.mode === "live" && (
            <p className="mt-2 text-sm">
              凭证有效期至 {formatDate(existing.authorization.expiresAt)}
            </p>
          )}
        </div>
      )}
      <Form form={form} layout="vertical" onFinish={submit}>
        {!isNewDouyin && (
          <>
            <Form.Item
              name="nickname"
              label="账号名称"
              rules={[{ required: true }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="accountId"
              label="平台账号 ID"
              rules={[{ required: true }]}
            >
              <Input readOnly={!!existing?.authorization} maxLength={100} />
            </Form.Item>
          </>
        )}
        <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
          <Select
            disabled={!!existing?.authorization}
            options={options(platformMap)}
          />
        </Form.Item>
        <Form.Item name="tier" label="归属" rules={[{ required: true }]}>
          <Select options={options(tierMap)} />
        </Form.Item>
        <Form.Item name="storeId" label="门店">
          <Select
            allowClear
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
