import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Select,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { FormInstance } from "antd";
import { getPage, save, remove } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import PageState from "./PageState";
export interface Identified {
  id: string;
}
export default function ResourcePage<T extends Identified>({
  title,
  description,
  path,
  columns,
  fields,
  prepare,
  initial,
  canManage,
  filter,
  extraActions,
  updateMethod = "PUT",
  allowDelete = true,
  filters,
}: {
  title: string;
  description: string;
  path: string;
  columns: ColumnsType<T>;
  fields: (form: FormInstance, editing: T | null) => ReactNode;
  prepare?: (values: Record<string, unknown>, editing: T | null) => unknown;
  initial?: Record<string, unknown>;
  canManage?: boolean;
  filter?: ReactNode;
  extraActions?: (record: T) => ReactNode;
  updateMethod?: string;
  allowDelete?: boolean;
  filters?: Record<string, { label: string; options: Record<string, string> }>;
}) {
  const { canWrite } = useAuth();
  const manage = canManage ?? canWrite;
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [filterValues, setFilterValues] = useState<
    Record<string, string | undefined>
  >({});
  const [viewing, setViewing] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form] = Form.useForm();
  const query = useQuery({
    queryKey: [path, { page, q, ...filterValues }],
    queryFn: () => getPage<T>(path, { page, pageSize: 10, q, ...filterValues }),
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [path] });
    void client.invalidateQueries({ queryKey: ["overview"] });
  };
  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) =>
      save(
        editing ? `${path}/${editing.id}` : path,
        prepare ? prepare(values, editing) : values,
        editing ? updateMethod : "POST",
      ),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      message.success("已保存");
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deletion = useMutation({
    mutationFn: (id: string) => remove(`${path}/${id}`),
    onSuccess: () => {
      invalidate();
      message.success("已删除");
    },
    onError: (e: Error) => message.error(e.message),
  });
  const edit = (record: T | null, view = false) => {
    setViewing(view);
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(
      record
        ? {
            ...record,
            config: JSON.stringify(
              (record as T & { config?: unknown }).config ?? {},
              null,
              2,
            ),
          }
        : initial,
    );
    setOpen(true);
  };
  const allColumns: ColumnsType<T> = [
    ...columns,
    {
      title: "操作",
      key: "actions",
      render: (_, record) => (
        <Space wrap>
          <Button type="link" onClick={() => edit(record, true)}>
            详情
          </Button>
          {extraActions?.(record)}
          {manage && (
            <>
              <Button type="link" onClick={() => edit(record)}>
                编辑
              </Button>
              {allowDelete && (
                <Button
                  type="link"
                  danger
                  loading={deletion.isPending}
                  onClick={() =>
                    modal.confirm({
                      title: "确认删除这条记录？",
                      content: "删除后无法恢复。被引用的记录需先解除关联。",
                      onOk: () => deletion.mutateAsync(record.id),
                    })
                  }
                >
                  删除
                </Button>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];
  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="flex flex-wrap gap-3 justify-between">
        <Space wrap>
          <Input.Search
            placeholder="搜索名称"
            allowClear
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            style={{ width: 260 }}
          />
          {Object.entries(filters || {}).map(([key, f]) => (
            <Select
              key={key}
              allowClear
              placeholder={f.label}
              value={filterValues[key]}
              style={{ width: 140 }}
              options={Object.entries(f.options).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(value) => {
                setFilterValues((v) => ({ ...v, [key]: value }));
                setPage(1);
              }}
            />
          ))}
          {filter}
        </Space>
        {manage && (
          <Button type="primary" onClick={() => edit(null)}>
            新增
          </Button>
        )}
      </div>
      <PageState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <Card styles={{ body: { padding: 0 } }}>
          <Table<T>
            rowKey="id"
            columns={allColumns}
            dataSource={query.data.items}
            scroll={{ x: 800 }}
            loading={query.isFetching}
            pagination={{
              current: page,
              pageSize: 10,
              total: query.data.total,
              onChange: setPage,
              showSizeChanger: false,
              showTotal: (n) => `共 ${n} 条`,
            }}
          />
        </Card>
      )}
      <Modal
        title={`${viewing ? "查看" : editing ? "编辑" : "新增"}${title}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        footer={viewing ? null : undefined}
        confirmLoading={mutation.isPending}
        destroyOnClose
      >
        <Form
          disabled={viewing}
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
        >
          {fields(form, editing)}
        </Form>
      </Modal>
    </div>
  );
}
