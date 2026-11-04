import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { request, save, remove, formatDate } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
interface TagRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  sort: number;
  active: boolean;
  createdAt: string;
  templateId?: string | null;
  tag: string;
}
type Values = Pick<
  TagRecord,
  "name" | "code" | "description" | "sort" | "active"
>;
interface Page {
  items: TagRecord[];
  total: number;
}
export default function Tags() {
  const { user } = useAuth();
  const writable =
    !!user &&
    (user.permissions.includes("*") || user.permissions.includes("tags:write"));
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [filterForm] = Form.useForm();
  const [filters, setFilters] = useState<{
    name?: string;
    code?: string;
    active?: string;
  }>({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
  const [editor, setEditor] = useState<{ record: TagRecord | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["tags", filters, pagination],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      return request<Page>(`/tags?${params}`);
    },
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["tags"] }),
      client.invalidateQueries({ queryKey: ["douyin-tracking-tags"] }),
      client.invalidateQueries({ queryKey: ["douyin-live-overview"] }),
    ]);
  };
  const submit = async (values: Values) => {
    if (!editor) return;
    setBusy(true);
    const base = "/tags";
    try {
      await save<TagRecord>(
        base + (editor.record ? `/${editor.record.id}` : ""),
        values,
        editor.record ? "PUT" : "POST",
      );
      await refresh();
      setEditor(null);
      message.success("保存成功");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  const deleteRow = (record: TagRecord) =>
    modal.confirm({
      title: `确认删除标签“${record.name}”？`,
      content:
        "删除后不能再用于新的模板关联；已同步视频的历史关联保留。标签名称和编码仍保留，避免重复使用导致历史归属混淆。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(`/tags/${record.id}`);
          await refresh();
          if (query.data?.items.length === 1 && pagination.page > 1)
            setPagination((p) => ({ ...p, page: p.page - 1 }));
          message.success("删除成功");
        } catch (e) {
          message.error(e instanceof Error ? e.message : "删除失败");
          throw e;
        }
      },
    });
  const columns = [
    {
      title: "标签名称",
      dataIndex: "name",
      render: (name: string, r: TagRecord) => (
        <span className="text-blue-600">#{name || r.tag}</span>
      ),
    },
    {
      title: "标签编码",
      dataIndex: "code",
      render: (v: string | null) => v || "—",
    },
    {
      title: "描述",
      dataIndex: "description",
      ellipsis: true,
      render: (v: string) => v || "—",
    },
    { title: "排序", dataIndex: "sort", width: 75 },
    {
      title: "状态",
      dataIndex: "active",
      width: 85,
      render: (v: boolean) => (
        <Tag color={v ? "success" : "default"}>{v ? "启用" : "停用"}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 175,
      render: formatDate,
    },
    {
      title: "操作",
      width: 135,
      render: (_: unknown, r: TagRecord) => (
        <Space>
          <Button
            type="link"
            className="!p-0"
            disabled={!writable}
            onClick={() => setEditor({ record: r })}
          >
            编辑
          </Button>
          <Button
            type="link"
            className="!p-0"
            disabled={!writable}
            onClick={() => deleteRow(r)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];
  return (
    <div>
      <div className="yp-page-header flex justify-between items-start gap-4">
        <div>
          <h1>标签管理</h1>
          <p>管理视频发布时携带的 tag，统一维护标签编码与可用状态。</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!writable}
          onClick={() => setEditor({ record: null })}
        >
          新增标签
        </Button>
      </div>
      <div className="yp-card p-5">
        <Form
          name="tag-filter"
          form={filterForm}
          layout="inline"
          className="!mb-5 gap-y-3"
          onFinish={(v) => {
            setFilters(v);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        >
          <Form.Item label="标签名称" name="name">
            <Input
              className="yp-search-field"
              allowClear
              maxLength={60}
              placeholder="请输入标签名称"
              onPressEnter={(e) => {
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                filterForm.submit();
              }}
            />
          </Form.Item>
          <Form.Item label="标签编码" name="code">
            <Input
              className="yp-search-field"
              allowClear
              maxLength={60}
              placeholder="请输入标签编码"
              onPressEnter={(e) => {
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                filterForm.submit();
              }}
            />
          </Form.Item>
          <Form.Item label="状态" name="active">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 140 }}
              options={[
                { value: "true", label: "启用" },
                { value: "false", label: "停用" },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  filterForm.resetFields();
                  setFilters({});
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
        {query.error && (
          <Alert
            type="error"
            message={query.error.message}
            action={<Button onClick={() => void query.refetch()}>重试</Button>}
          />
        )}
        <Table<TagRecord>
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items || []}
          columns={columns}
          scroll={{ x: 1100 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: query.data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (n) => `共 ${n} 条`,
            onChange: (page, pageSize) => setPagination({ page, pageSize }),
          }}
        />
      </div>
      {editor && (
        <TagEditor
          record={editor.record}
          busy={busy}
          onCancel={() => {
            if (!busy) setEditor(null);
          }}
          onSave={submit}
        />
      )}
    </div>
  );
}
function TagEditor({
  record,
  busy,
  onCancel,
  onSave,
}: {
  record: TagRecord | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: Values) => Promise<void>;
}) {
  const [form] = Form.useForm<Values>();
  const label = "标签";
  return (
    <Modal
      open
      title={`${record ? "编辑" : "新增"}${label}`}
      width={600}
      onCancel={onCancel}
      confirmLoading={busy}
      okText="保存"
      cancelText="取消"
      closable={!busy}
      maskClosable={!busy}
      onOk={() =>
        void form
          .validateFields()
          .then(onSave)
          .catch(() => undefined)
      }
    >
      {record?.templateId && (
        <Alert
          type="info"
          className="!mt-4"
          message="该 tag 已关联模板版本，名称固定；编码、描述、排序与状态仍可维护。"
        />
      )}
      <Form
        name="tag-editor"
        form={form}
        labelCol={{ span: 5 }}
        wrapperCol={{ span: 19 }}
        className="!mt-6"
        initialValues={
          record
            ? {
                name: record.name || record.tag,
                code: record.code,
                description: record.description,
                sort: record.sort,
                active: record.active,
              }
            : { name: "", code: "", description: "", sort: 0, active: true }
        }
        disabled={busy}
      >
        <Form.Item
          name="name"
          label={`${label}名称`}
          rules={[
            { required: true, whitespace: true, message: `请输入${label}名称` },
            { max: 100 },
            {
              pattern: /^#?[\p{L}\p{N}\p{M}_]+$/u,
              message: "仅支持中英文、数字和下划线",
            },
          ]}
        >
          <Input
            maxLength={100}
            disabled={!!record?.templateId}
            placeholder="发布时携带的 tag，例如 御品轩新品"
          />
        </Form.Item>
        <Form.Item
          name="code"
          label={`${label}编码`}
          rules={[
            { required: true, message: `请输入${label}编码` },
            {
              pattern: /^[A-Z0-9_]+$/,
              message: "仅支持大写英文、数字或下划线",
            },
            { max: 60 },
          ]}
        >
          <Input maxLength={60} placeholder="请输入大写英文、数字或下划线" />
        </Form.Item>
        <Form.Item name="description" label="描述" rules={[{ max: 200 }]}>
          <Input.TextArea
            rows={4}
            maxLength={200}
            showCount
            placeholder={`请输入${label}描述（最多 200 字）`}
          />
        </Form.Item>
        <Form.Item
          name="sort"
          label="排序"
          rules={[
            { required: true, message: "请输入排序" },
            {
              type: "integer",
              min: 0,
              max: 9999,
              message: "请输入 0—9999 的整数",
            },
          ]}
        >
          <InputNumber
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item name="active" label="状态" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: true, label: "启用" },
              { value: false, label: "停用" },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
