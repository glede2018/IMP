import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Avatar,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Alert,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { request, save, remove, formatDate } from "@/services/api";
import type { UserInfo } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
interface AccessRole {
  id: string;
  name: string;
  code: string;
  description: string;
  sort: number;
  active: boolean;
  system: boolean;
  permissions: string[];
  createdAt: string;
  _count: { users: number };
}
interface Catalog {
  key: string;
  label: string;
}
type RoleValues = Pick<
  AccessRole,
  "name" | "code" | "description" | "sort" | "active"
>;
type UserValues = {
  username: string;
  name: string;
  phone: string;
  active: boolean;
  password?: string;
  roleIds?: string[];
};
const status = (v: boolean) => (
  <Tag color={v ? "success" : "orange"}>{v ? "启用" : "停用"}</Tag>
);
export default function Permissions({ kind }: { kind: "roles" | "users" }) {
  const isRoles = kind === "roles";
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [active, setActive] = useState<boolean>();
  const [filterActive, setFilterActive] = useState<boolean>();
  const [roleFilter, setRoleFilter] = useState<string>();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [editing, setEditing] = useState<AccessRole | UserInfo | null>();
  const [action, setAction] = useState<
    "edit" | "permissions" | "roles" | "password"
  >("edit");
  const [busy, setBusy] = useState(false);
  const [grants, setGrants] = useState<string[]>([]);
  const [form] = Form.useForm<RoleValues & UserValues>();
  const roles = useQuery({
    queryKey: ["access-roles"],
    queryFn: () => request<AccessRole[]>("/permissions/roles"),
  });
  const users = useQuery({
    queryKey: ["access-users"],
    queryFn: () => request<UserInfo[]>("/permissions/users"),
    enabled: !isRoles,
  });
  const catalog = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: () => request<Catalog[]>("/permissions/catalog"),
  });
  const error = roles.error || users.error || catalog.error;
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["access-roles"] }),
      client.invalidateQueries({ queryKey: ["access-users"] }),
    ]);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setEditing(undefined);
      message.success("操作成功");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const open = (
    record: AccessRole | UserInfo | null,
    mode: typeof action = "edit",
  ) => {
    setEditing(record);
    setAction(mode);
    form.resetFields();
    if (mode === "permissions") setGrants((record as AccessRole).permissions);
    else
      form.setFieldsValue(
        record
          ? {
              ...record,
              roleIds:
                "roles" in record ? record.roles.map((r) => r.id) : undefined,
            }
          : { active: true, sort: 0, description: "" },
      );
  };
  const commit = async () => {
    if (action === "permissions") {
      const r = editing as AccessRole;
      await run(() =>
        save(
          `/permissions/roles/${r.id}/permissions`,
          { permissions: grants },
          "PUT",
        ),
      );
      return;
    }
    const v = await form.validateFields();
    const path = `/permissions/${kind}${editing ? `/${editing.id}` : ""}${action === "edit" ? "" : `/${action}`}`;
    const body =
      action === "roles"
        ? { roleIds: v.roleIds }
        : action === "password"
          ? { password: v.password }
          : isRoles
            ? {
                name: v.name,
                code: v.code,
                description: v.description,
                sort: v.sort,
                active: v.active,
              }
            : {
                username: v.username,
                name: v.name,
                phone: v.phone,
                active: v.active,
                ...(!editing
                  ? { password: v.password, roleIds: v.roleIds }
                  : {}),
              };
    await run(() => save(path, body, editing ? "PUT" : "POST"));
  };
  const confirmDelete = (r: AccessRole | UserInfo) =>
    modal.confirm({
      title: `删除${isRoles ? "角色" : "用户"}“${r.name}”？`,
      content: isRoles
        ? "仍有用户的角色不能删除。"
        : "删除后该用户将无法登录。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      onOk: () => run(() => remove(`/permissions/${kind}/${r.id}`)),
    });
  const roleOptions = roles.data
    ?.filter((r) => r.active)
    .map((r) => ({ value: r.id, label: r.name }));
  const roleRows = (roles.data || []).filter(
    (r) =>
      (!query ||
        `${r.name} ${r.code}`.toLowerCase().includes(query.toLowerCase())) &&
      (active === undefined || r.active === active),
  );
  const userRows = (users.data || []).filter(
    (u) =>
      (!query ||
        `${u.username} ${u.name} ${u.phone}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (active === undefined || u.active === active) &&
      (!roleFilter || u.roles.some((r) => r.id === roleFilter)),
  );
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold">
          {isRoles ? "角色管理" : "用户管理"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--yp-neutral-500)" }}>
          {isRoles
            ? "维护系统角色并配置可访问菜单"
            : "管理后台账号、登录密码和角色分配"}
        </p>
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error.message}
          action={
            <Button
              onClick={() => {
                void roles.refetch();
                void users.refetch();
                void catalog.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      )}
      <div className="yp-card p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <Space wrap>
          <Input
            aria-label={isRoles ? "角色查询" : "用户查询"}
            placeholder={isRoles ? "角色名称 / 角色编码" : "用户账号 / 昵称"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={() => {
              setQuery(text.trim());
              setActive(filterActive);
              setRoleFilter(selectedRole);
            }}
            style={{ width: 220 }}
          />
          {!isRoles && (
            <Select
              aria-label="角色筛选"
              placeholder="全部角色"
              allowClear
              value={selectedRole}
              onChange={setSelectedRole}
              options={roles.data?.map((r) => ({ value: r.id, label: r.name }))}
              style={{ width: 150 }}
            />
          )}
          <Select
            aria-label="状态筛选"
            placeholder="全部状态"
            allowClear
            value={filterActive}
            onChange={setFilterActive}
            options={[
              { value: true, label: "启用" },
              { value: false, label: "停用" },
            ]}
            style={{ width: 130 }}
          />
          <Button
            type="primary"
            onClick={() => {
              setQuery(text.trim());
              setActive(filterActive);
              setRoleFilter(selectedRole);
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setText("");
              setQuery("");
              setActive(undefined);
              setFilterActive(undefined);
              setSelectedRole(undefined);
              setRoleFilter(undefined);
            }}
          >
            重置
          </Button>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => open(null)}
        >
          {isRoles ? "新增角色" : "新增用户"}
        </Button>
      </div>
      <div className="yp-card overflow-hidden">
        {isRoles ? (
          <Table<AccessRole>
            rowKey="id"
            loading={roles.isPending}
            dataSource={roleRows}
            scroll={{ x: 1100 }}
            pagination={{
              pageSize: 10,
              showTotal: (total) => `共 ${total} 条记录`,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: "角色名称",
                dataIndex: "name",
                render: (name: string, r) => (
                  <Space>
                    {name}
                    {r.system && <Tag color="orange">系统角色</Tag>}
                  </Space>
                ),
              },
              { title: "角色编码", dataIndex: "code" },
              { title: "角色描述", dataIndex: "description" },
              { title: "排序", dataIndex: "sort" },
              { title: "用户数量", render: (_, r) => r._count.users },
              { title: "状态", dataIndex: "active", render: status },
              { title: "创建时间", dataIndex: "createdAt", render: formatDate },
              {
                title: "操作",
                width: 240,
                render: (_, r) => (
                  <Space size={12}>
                    <Button
                      type="link"
                      disabled={r.system}
                      onClick={() => open(r, "permissions")}
                    >
                      分配权限
                    </Button>
                    <Button
                      type="link"
                      disabled={r.system}
                      onClick={() => open(r)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      danger
                      disabled={r.system}
                      onClick={() => confirmDelete(r)}
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        ) : (
          <Table<UserInfo>
            rowKey="id"
            loading={users.isPending}
            dataSource={userRows}
            scroll={{ x: 1100 }}
            pagination={{
              pageSize: 10,
              showTotal: (total) => `共 ${total} 条记录`,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: "用户信息",
                render: (_, u) => (
                  <Space>
                    <Avatar style={{ background: "#ffedd5", color: "#ea580c" }}>
                      {u.name[0]}
                    </Avatar>
                    <div>
                      {u.username}
                      <div
                        className="text-xs"
                        style={{ color: "var(--yp-neutral-500)" }}
                      >
                        {u.name}
                      </div>
                    </div>
                  </Space>
                ),
              },
              {
                title: "手机号",
                dataIndex: "phone",
                render: (p: string) =>
                  p.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
              },
              {
                title: "所属角色",
                render: (_, u) => (
                  <Space wrap size={0}>
                    {u.roles.map((r) => (
                      <Tag key={r.id} color={r.active ? "orange" : "default"}>
                        {r.name}
                        {!r.active ? "（停用）" : ""}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
              { title: "账号状态", dataIndex: "active", render: status },
              {
                title: "最后登录时间",
                dataIndex: "lastLoginAt",
                render: (v: string) => (v ? formatDate(v) : "—"),
              },
              { title: "创建时间", dataIndex: "createdAt", render: formatDate },
              {
                title: "操作",
                width: 320,
                render: (_, u) => (
                  <Space size={12}>
                    <Button type="link" onClick={() => open(u)}>
                      编辑
                    </Button>
                    <Button
                      type="link"
                      disabled={u.id === user?.id}
                      onClick={() => open(u, "roles")}
                    >
                      分配角色
                    </Button>
                    <Button type="link" onClick={() => open(u, "password")}>
                      重置密码
                    </Button>
                    <Button
                      type="link"
                      danger
                      disabled={u.id === user?.id}
                      onClick={() => confirmDelete(u)}
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </div>
      <Modal
        title={
          action === "permissions"
            ? "分配权限"
            : action === "roles"
              ? "分配角色"
              : action === "password"
                ? "重置密码"
                : `${editing ? "编辑" : "新增"}${isRoles ? "角色" : "用户"}`
        }
        open={editing !== undefined}
        forceRender
        onCancel={() => setEditing(undefined)}
        onOk={() => void commit().catch(() => undefined)}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
      >
        {action === "permissions" ? (
          <>
            <p className="mb-4 text-sm">
              多个角色的启用权限合并生效；操作权限需同时选中对应菜单。
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {catalog.data?.map((c) => (
                <Checkbox
                  key={c.key}
                  checked={grants.includes(c.key)}
                  onChange={(e) =>
                    setGrants((previous) =>
                      e.target.checked
                        ? [...new Set([...previous, c.key])]
                        : previous.filter((key) => key !== c.key),
                    )
                  }
                >
                  {c.label}
                </Checkbox>
              ))}
            </div>
          </>
        ) : (
          <Form form={form} layout="vertical">
            {action === "edit" &&
              (isRoles ? (
                <>
                  <Form.Item
                    name="name"
                    label="角色名称"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={60} />
                  </Form.Item>
                  <Form.Item
                    name="code"
                    label="角色编码"
                    rules={[
                      { required: true },
                      {
                        pattern: /^[a-z][a-z0-9_]{1,49}$/,
                        message: "2–50 位小写字母、数字或下划线，以字母开头",
                      },
                    ]}
                  >
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item name="description" label="角色描述">
                    <Input.TextArea maxLength={500} />
                  </Form.Item>
                  <Form.Item
                    name="sort"
                    label="排序"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} max={9999} />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    name="username"
                    label="用户账号"
                    rules={[
                      { required: true },
                      {
                        pattern: /^[a-zA-Z0-9_]{3,50}$/,
                        message: "3–50 位字母、数字或下划线",
                      },
                    ]}
                  >
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item
                    name="name"
                    label="昵称"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name="phone"
                    label="手机号"
                    rules={[
                      { required: true },
                      { pattern: /^1[3-9]\d{9}$/, message: "请输入正确手机号" },
                    ]}
                  >
                    <Input maxLength={11} />
                  </Form.Item>
                </>
              ))}
            {action === "edit" && (
              <Form.Item name="active" label="状态" valuePropName="checked">
                <Switch
                  checkedChildren="启用"
                  unCheckedChildren="停用"
                  disabled={!isRoles && editing?.id === user?.id}
                />
              </Form.Item>
            )}
            {!isRoles &&
              (action === "roles" || (action === "edit" && !editing)) && (
                <Form.Item
                  name="roleIds"
                  label="所属角色"
                  rules={[{ required: true, message: "至少选择一个角色" }]}
                >
                  <Select mode="multiple" options={roleOptions} />
                </Form.Item>
              )}
            {!isRoles &&
              (action === "password" || (action === "edit" && !editing)) && (
                <Form.Item
                  name="password"
                  label={action === "password" ? "新密码" : "初始密码"}
                  rules={[
                    { required: true },
                    { min: 12, message: "密码至少 12 位" },
                  ]}
                >
                  <Input.Password autoComplete="new-password" maxLength={128} />
                </Form.Item>
              )}
          </Form>
        )}
      </Modal>
    </div>
  );
}
