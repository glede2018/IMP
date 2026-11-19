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
  description: string;
  sort: number;
  active: boolean;
  createdAt: string;
  templateId?: string | null;
  tag: string;
}
type Values = Pick<TagRecord, "name" | "description" | "sort" | "active">;
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
      content: "删除后不能再用于新的模板关联；已同步视频的历史关联保留。",
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
      render: (name: string, r: TagRecord) => <span>#{name || r.tag}</span>,
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
            disabled={!writable}
            onClick={() => setEditor({ record: r })}
          >
            编辑
          </Button>
          <Button
            type="link"
            danger
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
    <div className="space-y-4">
      <div className="yp-card p-4 flex items-center justify-between gap-4 flex-wrap">
        <Form
          name="tag-filter"
          form={filterForm}
          className="min-w-0"
          onFinish={(v) => {
            setFilters(v);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        >
          <Space wrap>
            <Form.Item name="name" noStyle>
              <Input
                className="yp-search-field"
                aria-label="搜索标签名称"
                allowClear
                maxLength={100}
                style={{ width: 220 }}
                placeholder="搜索标签名称"
                onPressEnter={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  filterForm.submit();
                }}
              />
            </Form.Item>
            <Form.Item name="active" noStyle>
              <Select
                aria-label="状态筛选"
                placeholder="全部状态"
                allowClear
                style={{ width: 130 }}
                options={[
                  { value: "true", label: "启用" },
                  { value: "false", label: "停用" },
                ]}
              />
            </Form.Item>
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
        </Form>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!writable}
          onClick={() => setEditor({ record: null })}
        >
          新增标签
        </Button>
      </div>
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div className="yp-card overflow-hidden">
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
          message="该标签已关联模板版本，名称固定；描述、排序与状态仍可维护。"
        />
      )}
      <Form
        name="tag-editor"
        form={form}
        labelCol={{ span: 5 }}
        wrapperCol={{ span: 19 }}
        className="!mt-4"
        initialValues={
          record
            ? {
                name: record.name || record.tag,
                description: record.description,
                sort: record.sort,
                active: record.active,
              }
            : { name: "", description: "", sort: 0, active: true }
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
