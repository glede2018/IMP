import { useState } from "react";
import {
  Alert,
  App,
  Button,
  Col,
  Form,
  Image,
  Input,
  Modal,
  Row,
  Select,
  Table,
  Tag,
  Upload,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { categoryMap, request } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
type Source = {
  id: string;
  title: string;
  description: string;
  cover: { url: string } | null;
  compatible: boolean;
  reason?: string;
  importedId?: string;
  slots: { id: string; label: string; preview: string | null }[];
};
export default function TemplateCatalog() {
  const { message } = App.useApp(),
    client = useQueryClient(),
    { user } = useAuth();
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [current, setCurrent] = useState<Source>(),
    [busy, setBusy] = useState(false),
    [form] = Form.useForm();
  const allowed =
    !!user &&
    (user.permissions.includes("*") ||
      user.permissions.includes("templates:create"));
  const query = useQuery({
    queryKey: ["template-catalog", q, page],
    queryFn: () =>
      request<{ items: Source[]; total: number }>(
        `/template-catalog?q=${encodeURIComponent(q)}&page=${page}`,
      ),
    retry: false,
  });
  async function submit(values: Record<string, unknown>) {
    setBusy(true);
    try {
      await request("/template-catalog/import", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          description: values.description || "",
          sourceTemplateId: current!.id,
        }),
      });
      message.success("已导入模板市场");
      setCurrent(undefined);
      await client.invalidateQueries({ queryKey: ["template-catalog"] });
      await client.invalidateQueries({ queryKey: ["template-market"] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="yp-page-header">
        <h1>模板列表</h1>
      </div>
      <Input.Search
        aria-label="搜索模板"
        placeholder="搜索模板名称、简介"
        allowClear
        style={{ width: 320 }}
        onSearch={(v) => {
          setQ(v.trim());
          setPage(1);
        }}
      />
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <Table
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data?.items || []}
        pagination={{
          current: page,
          pageSize: 10,
          total: query.data?.total || 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          {
            title: "封面",
            render: (_, r: Source) =>
              r.cover ? (
                <Image
                  width={100}
                  height={64}
                  style={{ objectFit: "cover" }}
                  src={r.cover.url}
                />
              ) : (
                "—"
              ),
          },
          { title: "模板名称", dataIndex: "title" },
          { title: "模板简介", dataIndex: "description", ellipsis: true },
          { title: "图片槽位", render: (_, r: Source) => r.slots.length },
          {
            title: "状态",
            render: (_, r: Source) =>
              r.importedId ? (
                <Tag color="green">已导入</Tag>
              ) : !r.compatible ? (
                <Tag>{r.reason}</Tag>
              ) : (
                <Tag color="blue">可导入</Tag>
              ),
          },
          {
            title: "操作",
            render: (_, r: Source) => (
              <Button
                type="link"
                disabled={!allowed || !!r.importedId || !r.compatible}
                onClick={() => {
                  form.resetFields();
                  form.setFieldsValue({
                    title: r.title,
                    description: r.description,
                  });
                  setCurrent(r);
                }}
              >
                导入模板市场
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="导入模板市场"
        open={!!current}
        width={880}
        centered
        styles={{
          body: { maxHeight: "calc(100dvh - 240px)", overflowY: "auto" },
        }}
        onCancel={() => !busy && setCurrent(undefined)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          disabled={busy}
          onFinish={(values) => void submit(values)}
          scrollToFirstError={{ block: "center", focus: true }}
        >
          <Form.Item
            name="title"
            label="模板标题"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="模板简介">
            <Input.TextArea maxLength={2000} rows={3} />
          </Form.Item>
          <Form.Item
            name="category"
            label="模板分类"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.entries(categoryMap).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <div className="flex flex-wrap items-start gap-4 mb-4">
            {current?.cover && (
              <Image
                width={130}
                height={96}
                style={{ objectFit: "cover" }}
                src={current.cover.url}
              />
            )}
            <Form.Item
              name="coverAssetId"
              label="模板封面"
              className="min-w-0 flex-1"
            >
              <CoverInput disabled={busy} />
            </Form.Item>
          </div>
          <Row gutter={[20, 16]}>
            {current?.slots.map((s) => (
              <Col key={s.id} xs={24} md={12} className="min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0" style={{ width: 96, height: 80 }}>
                    {s.preview ? (
                      <Image
                        width={96}
                        height={80}
                        style={{ objectFit: "cover" }}
                        src={s.preview}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-gray-400">
                        暂无预览
                      </div>
                    )}
                  </div>
                  <Form.Item
                    name={["slotTypes", s.id]}
                    label={
                      <span
                        title={s.label}
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          overflow: "hidden",
                          lineHeight: "22px",
                          height: 44,
                        }}
                      >
                        {s.label}
                      </span>
                    }
                    className="min-w-0 flex-1 !mb-0"
                    rules={[{ required: true, message: "请选择素材类型" }]}
                  >
                    <Select
                      className="w-full"
                      placeholder="选择素材类型"
                      options={[
                        { value: "product", label: "产品素材" },
                        { value: "person", label: "人物素材" },
                      ]}
                    />
                  </Form.Item>
                </div>
              </Col>
            ))}
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
function CoverInput({
  onChange,
  disabled,
}: {
  value?: string;
  onChange?: (v?: string) => void;
  disabled: boolean;
}) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  return (
    <Upload
      accept="image/jpeg,image/png,image/webp"
      maxCount={1}
      onRemove={() => onChange?.(undefined)}
      listType="picture"
      disabled={disabled || loading}
      customRequest={async ({ file, onSuccess, onError }) => {
        setLoading(true);
        try {
          const data = new FormData();
          data.append("file", file);
          const result = await request<{ id: string }>("/templates/cover", {
            method: "POST",
            body: data,
          });
          onChange?.(result.id);
          onSuccess?.(result);
        } catch (e) {
          message.error((e as Error).message);
          onError?.(e as Error);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Button icon={<UploadOutlined />} loading={loading}>
        替换封面
      </Button>
    </Upload>
  );
}
