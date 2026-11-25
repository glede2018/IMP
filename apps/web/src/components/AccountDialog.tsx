import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Typography,
  Tooltip,
} from "antd";
import { fetchStores, platformMap, save, tierMap } from "@/services/api";
import type { Account, Platform, Store } from "@/types";
import douyinIcon from "@/assets/social/douyin.svg";
import kuaishouIcon from "@/assets/social/kuaishou.svg";
import xiaohongshuIcon from "@/assets/social/xiaohongshu.svg";
import shipinhaoIcon from "@/assets/social/shipinghao.svg";
const platformIcons: Record<Platform, string> = {
  douyin: douyinIcon,
  kuaishou: kuaishouIcon,
  xiaohongshu: xiaohongshuIcon,
  shipinhao: shipinhaoIcon,
};
function PlatformPicker({ value, onChange, disabled }: {
  value?: Platform;
  onChange?: (value: Platform) => void;
  disabled: boolean;
}) {
  return (
    <Space size={16} role="radiogroup" aria-label="账号平台">
      {Object.entries(platformMap).map(([key, label]) => (
        <Tooltip key={key} title={label}>
          <Button
            type="default"
            className={`yp-platform-choice${value === key ? " is-selected" : ""}`}
            role="radio"
            aria-checked={value === key}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange?.(key as Platform)}

          >
            <img src={platformIcons[key as Platform]} alt="" style={{ width: 52, height: 52, flexShrink: 0 }} />
          </Button>
        </Tooltip>
      ))}
    </Space>
  );
}
const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));
type Preview = {
  uid: string;
  secUid: string;
  nickname: string;
  avatar: string | null;
  fans: string | null;
  confirmationToken: string;
};
const guides: Record<
  Platform,
  { label: string; example: string; method: string; share: string }
> = {
  douyin: {
    label: "用户 ID",
    example: "MS4wLjABAAAAhYCwfJpCgIy9aao47My7ZwQT_pP_LzJlnb-800tywOg",
    method: "电脑打开抖音主页，复制 /user/ 后以 MS4wLj 开头的 ID。",
    share: "https://v.douyin.com/lSGLaXP-090/",
  },
  xiaohongshu: {
    label: "用户 ID",
    example: "67767bba000000001801cd2d",
    method:
      "打开小红书主页，复制 /user/profile/ 后的 24 位 ID，或在个人主页分享并复制链接。",
    share: "https://www.xiaohongshu.com/user/profile/67767bba000000001801cd2d",
  },
  kuaishou: {
    label: "用户 ID",
    example: "1589037969 或 3x27bmjkcvidfne",
    method: "打开快手个人主页，复制主页 ID，或点击分享主页并复制链接。",
    share: "https://v.kuaishou.com/JzvAv2ML",
  },
  shipinhao: {
    label: "视频号 ID",
    example: "sphilT1fCLWHKd7 或 v2_…@finder",
    method:
      "打开视频号主页，进入账号资料，复制 sph 开头的视频号 ID；已有 finder username 也可直接填写。",
    share: "仅支持 https://weixin.qq.com/sph/… 格式的视频短链，不支持微信分享卡片。",
  },
};
export default function AccountDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Account | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { canWrite } = useAuth();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [stores, setStores] = useState<Store[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [querying, setQuerying] = useState(false);
  const sequence = useRef(0);
  const existing = target && target !== "new" ? target : null;
  const platform = (Form.useWatch("platform", form) || "douyin") as Platform;
  const guide = guides[platform];
  useEffect(() => {
    sequence.current++;
    setPreview(null);
    setBusy(false);
    setQuerying(false);
    form.resetFields();
    if (!target) return;
    form.setFieldsValue(
      target === "new"
        ? { platform: "douyin", tier: "brand" }
        : {
            ...target,
            user_id:
              target.dataSecUid ||
              target.dataUid ||
              (target.platform !== "douyin" ? target.accountId : ""),
          },
    );
    fetchStores()
      .then(setStores)
      .catch((e) => message.error(e.message));
    return () => {
      sequence.current++;
    };
  }, [target, form, message]);
  const query = async () => {
    const values = form.getFieldsValue();
    if (!values.user_id?.trim() && !values.share_text?.trim()) {
      message.warning("用户 ID 和分享链接至少填写一项");
      return;
    }
    const current = ++sequence.current;
    setPreview(null);
    setQuerying(true);
    try {
      const data = await save<Preview>("/accounts/profile/preview", {
        platform: values.platform,
        user_id: values.user_id?.trim() || "",
        share_text: values.share_text?.trim() || "",
        ...(existing ? { accountId: existing.id } : {}),
      });
      if (sequence.current === current) setPreview(data);
    } catch (e) {
      if (sequence.current === current)
        message.error(e instanceof Error ? e.message : "查询失败");
    } finally {
      if (sequence.current === current) setQuerying(false);
    }
  };
  const submit = async () => {
    if (!target) return;
    if (!existing && !preview) return;
    try {
      const values = await form.validateFields([
        "platform",
        "tier",
        "storeId",
        ...(existing && !preview ? ["nickname"] : []),
      ]);
      setBusy(true);
      if (preview)
        await save("/accounts/profile/bind", {
          confirmationToken: preview.confirmationToken,
          tier: values.tier,
          ...(values.storeId ? { storeId: values.storeId } : {}),
        });
      else if (existing)
        await save(
          `/accounts/${existing.id}`,
          {
            nickname: values.nickname,
            accountId: existing.accountId,
            platform: existing.platform,
            tier: values.tier,
            storeId: values.storeId || null,
          },
          "PUT",
        );
      message.success(preview ? "账号已绑定" : "账号信息已保存");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={existing ? "账号信息" : "绑定账号"}
      open={!!target}
      style={{ top: 32 }}
      styles={{ body: { maxHeight: "calc(100dvh - 200px)", overflowY: "auto" } }}
      onCancel={() => {
        if (!busy) onClose();
      }}
      destroyOnClose
      footer={
        <Space>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            disabled={!canWrite || querying || (!existing && !preview)}
            loading={busy}
            onClick={() => void submit()}
          >
            {existing && !preview ? "保存" : "确认绑定"}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={busy || !canWrite}
        onValuesChange={(changed) => {
          if ("platform" in changed) {
            form.setFieldsValue({ user_id: "", share_text: "" });
          }
          if (
            "platform" in changed ||
            "user_id" in changed ||
            "share_text" in changed
          ) {
            sequence.current++;
            setPreview(null);
            setQuerying(false);
          }
        }}
      >
        <Form.Item name="platform" rules={[{ required: true }]}>
          <PlatformPicker disabled={!!existing || busy || !canWrite} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="tier" label="归属" rules={[{ required: true }]}>
              <Select options={options(tierMap)} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="storeId" label="门店">
              <Select
                allowClear
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="user_id"
          label={guide.label}
          extra={
            <div style={{ fontSize: 12, lineHeight: "18px" }}>
              <div style={{ overflowWrap: "anywhere" }}>
                {guide.example}
              </div>
              <div>{guide.method}</div>
            </div>
          }
        >
          <Input
            maxLength={512}
            placeholder={`填写${guide.label}`}
            onPressEnter={() => void query()}
          />
        </Form.Item>
        <Form.Item
          name="share_text"
          label={platform === "shipinhao" ? "视频分享短链" : "主页分享链接 / share_text"}
          extra={<span style={{ fontSize: 12, lineHeight: "18px" }}>{guide.share}</span>}
        >
          <Input.TextArea
            rows={2}
            maxLength={2048}
            placeholder={platform === "shipinhao"
              ? "粘贴 https://weixin.qq.com/sph/… 视频短链，与视频号 ID 至少填一项"
              : "粘贴主页链接或完整分享文案，与用户 ID 至少填一项"}
          />
        </Form.Item>
        <Button
          loading={querying}
          disabled={busy || !canWrite}
          onClick={() => void query()}
        >
          查询用户信息
        </Button>
        {preview && (
          <Card size="small" style={{ marginTop: 16, marginBottom: 16 }}>
            <Space>
              <Avatar src={preview.avatar} size={48}>
                {[...preview.nickname][0]}
              </Avatar>
              <div>
                <Typography.Text strong>{preview.nickname}</Typography.Text>
                <div
                  style={{
                    overflowWrap: "anywhere",
                    fontSize: 12,
                    color: "var(--yp-neutral-500)",
                  }}
                >
                  ID：{preview.secUid}
                </div>
                <div>
                  粉丝：
                  {preview.fans == null
                    ? "—"
                    : Number(preview.fans).toLocaleString("zh-CN")}
                </div>
              </div>
            </Space>
          </Card>
        )}
        {existing && !preview && (
          <Form.Item
            style={{ marginTop: 16 }}
            name="nickname"
            label="账号名称"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
        )}

      </Form>
    </Modal>
  );
}
