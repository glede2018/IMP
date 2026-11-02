import { useState } from "react";
import { App, Button, Card, Descriptions, Form, Input } from "antd";
import { useAuth } from "@/contexts/AuthContext";
import { save } from "@/services/api";
export default function Settings() {
  const { user, refresh } = useAuth();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>账号设置</h1>
        <p>查看组织信息与修改登录密码</p>
      </div>
      <Card>
        <Descriptions
          column={2}
          items={[
            { key: "name", label: "姓名", children: user?.name },
            { key: "phone", label: "手机号", children: user?.phone },
            { key: "company", label: "组织", children: user?.company },
            {
              key: "role",
              label: "角色",
              children: user ? user.roles.map((r) => r.name).join("、") : "",
            },
          ]}
        />
      </Card>
      <Card title="修改密码">
        <Form
          layout="vertical"
          style={{ maxWidth: 400 }}
          onFinish={async (v: {
            currentPassword: string;
            newPassword: string;
          }) => {
            setBusy(true);
            try {
              await save("/auth/password", v);
              message.success("密码已修改，请重新登录");
              await refresh();
            } catch (e) {
              message.error(e instanceof Error ? e.message : "修改失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true }, { min: 12, message: "至少 12 位" }]}
          >
            <Input.Password autoComplete="new-password" maxLength={128} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存密码
          </Button>
        </Form>
      </Card>
    </div>
  );
}
