import { importSlots } from "@/services/workflow";
import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Space,
  Tag,
  Upload,
  Steps,
  Table,
} from "antd";
import type { UploadFile } from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { categoryMap, getPage, request, save } from "@/services/api";
import type { Asset, Template } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
type Row = Template & { cover?: string | null };
export default function Templates() {
  const { user } = useAuth();
  const canCreate =
    !!user &&
    (user.permissions.includes("*") ||
      user.permissions.includes("templates:create"));
  const canUse =
    !!user &&
    (user.permissions.includes("*") ||
      ["works", "works:write", "assets"].every((key) =>
        user.permissions.includes(key),
      ));
  const [urlParams] = useSearchParams();
  const urlQuery = urlParams.get("q") || "";
  const navigate = useNavigate(),
    client = useQueryClient();
  const [search, setSearch] = useState(""),
    [keyword, setKeyword] = useState(""),
    [category, setCategory] = useState<string>(),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false);
  useEffect(() => {
    setSearch(urlQuery);
    setKeyword(urlQuery);
    setPage(1);
  }, [urlQuery]);
  const query = useQuery({
    queryKey: ["template-market", keyword, category, page],
    queryFn: () =>
      getPage<Row>("/templates", { q: keyword, category, page, pageSize: 12 }),
  });
  return (
    <div className="space-y-5">
      <div className="yp-page-header flex justify-between items-start gap-4">
        <div>
          <h1>模板市场</h1>
          <p>浏览并选用适合烘焙门店场景的内容模板，生成品牌宣传视频</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canCreate}
          onClick={() => setOpen(true)}
        >
          新增模板
        </Button>
      </div>
      <Space wrap>
        <Input.Search
          aria-label="搜索模板名称"
          placeholder="搜索模板名称"
          value={search}
          allowClear
          style={{ width: 280 }}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) {
              setKeyword("");
              setPage(1);
            }
          }}
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          prefix={<SearchOutlined />}
        />
        <Select
          aria-label="模板分类"
          placeholder="全部分类"
          allowClear
          style={{ width: 160 }}
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
          options={Object.entries(categoryMap).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </Space>
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {query.isPending
          ? Array.from({ length: 6 }, (_, i) => (
              <Card key={i}>
                <Skeleton active />
              </Card>
            ))
          : query.data?.items.map((t) => (
              <Card
                key={t.id}
                styles={{ body: { padding: 12 } }}
                className="overflow-hidden"
                cover={
                  t.cover ? (
                    <Image
                      src={t.cover}
                      alt={t.title}
                      preview={false}
                      style={{ width: "100%", height: 180, objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="h-44 flex items-center justify-center"
                      style={{
                        background: "var(--yp-primary-50)",
                        color: "var(--yp-primary-400)",
                      }}
                    >
                      <PictureOutlined style={{ fontSize: 40 }} />
                    </div>
                  )
                }
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h3 className="text-base font-semibold m-0">{t.title}</h3>
                  <Tag color="orange">{categoryMap[t.category]}</Tag>
                </div>
                <p
                  className="text-sm mb-3"
                  style={{ color: "var(--yp-neutral-500)", minHeight: 44 }}
                >
                  {t.description}
                </p>
                <Button
                  type="primary"
                  block
                  disabled={!canUse}
                  onClick={() =>
                    navigate(
                      `/video-editor?templateId=${encodeURIComponent(t.id)}`,
                    )
                  }
                >
                  使用模板
                </Button>
              </Card>
            ))}
      </div>
      {!query.isPending && !query.error && !query.data?.total && (
        <Empty description="暂无匹配的模板" />
      )}
      {!!query.data?.total && (
        <div className="flex justify-end">
          <Pagination
            current={page}
            total={query.data.total}
            pageSize={12}
            showSizeChanger={false}
            onChange={setPage}
            showTotal={(n) => `共 ${n} 个模板`}
          />
        </div>
      )}
      {open && (
        <TemplateEditor
          onCancel={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setPage(1);
            await client.invalidateQueries({ queryKey: ["template-market"] });
          }}
        />
      )}
    </div>
  );
}
function TemplateEditor({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [slotTypes, setSlotTypes] = useState<
    Record<string, "product" | "person">
  >({});
  const [nodes, setNodes] = useState<ReturnType<typeof importSlots>>([]);
  const submit = async () => {
    const v = await form.validateFields();
    if (step === 0) {
      try {
        const slots = importSlots(v.config);
        setNodes(slots);
        setSlotTypes({});
        setStep(1);
      } catch (e) {
        message.error(e instanceof Error ? e.message : "工作流无效");
      }
      return;
    }
    if (nodes.some((n) => !slotTypes[n.id])) {
      message.warning("请选择每个槽位的素材来源");
      return;
    }
    setBusy(true);
    try {
      const file = v.cover as File | undefined;
      if (!file) throw new Error("请上传封面图片");
      const data = new FormData();
      data.append("file", file);
      const cover = await request<Asset>("/templates/cover", {
        method: "POST",
        body: data,
      });
      await save("/templates", {
        title: v.title.trim(),
        description: v.description.trim(),
        category: v.category,
        config: {
          workflowFormat: "creatkey",
          definition: v.config,
          slots: nodes.map((n) => ({
            nodeId: n.id,
            label: n.data.label,
            materialType: slotTypes[n.id],
          })),
        },
        coverAssetId: cover.id,
        tags: [],
      });
      message.success("模板已新增");
      await onSaved();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "新增失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="新增模板"
      width={step === 0 ? 600 : 800}
      confirmLoading={busy}
      closable={!busy}
      maskClosable={!busy}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onOk={() => void submit().catch(() => undefined)}
      okText={step === 0 ? "下一步：配置槽位" : "完成导入"}
      cancelText="取消"
    >
      <Steps
        size="small"
        current={step}
        className="!my-5"
        items={[{ title: "导入模板" }, { title: "配置素材槽位" }]}
      />
      {step === 1 && (
        <div className="space-y-4">
          <Alert
            type="info"
            showIcon
            message={`识别到 ${nodes.length} 个可替换槽位`}
          />
          <Table
            rowKey="id"
            pagination={false}
            dataSource={nodes}
            columns={[
              {
                title: "节点名称",
                render: (_, n) => n.data.label,
              },
              {
                title: "图片预览",
                width: 120,
                render: (_, n) => {
                  const media = n.data.config.media as
                    { url?: unknown } | undefined;
                  const url = media?.url;
                  if (
                    n.data.kind !== "input.image" ||
                    typeof url !== "string" ||
                    !/^https?:\/\//i.test(url)
                  )
                    return "—";
                  return (
                    <Image
                      src={url}
                      alt={n.data.label}
                      width={80}
                      height={64}
                      style={{ objectFit: "contain", borderRadius: 6 }}
                    />
                  );
                },
              },
              {
                title: "素材来源",
                render: (_, n) => (
                  <Select
                    disabled={busy}
                    aria-label={`${n.data.label}素材来源`}
                    style={{ width: 190 }}
                    placeholder="请选择素材来源"
                    value={slotTypes[n.id]}
                    onChange={(v) =>
                      setSlotTypes((prev) => ({ ...prev, [n.id]: v }))
                    }
                    options={[
                      { value: "product", label: "产品素材图片" },
                      { value: "person", label: "人物素材图片" },
                    ]}
                  />
                ),
              },
            ]}
          />
          <Button disabled={busy} onClick={() => setStep(0)}>
            上一步
          </Button>
        </div>
      )}
      <Form
        style={{ display: step === 0 ? undefined : "none" }}
        form={form}
        name="template-editor"
        layout="horizontal"
        labelCol={{ span: 5 }}
        wrapperCol={{ span: 19 }}
        className="!mt-6"
        disabled={busy}
      >
        <Form.Item
          name="title"
          label="模板标题"
          rules={[
            { required: true, whitespace: true, message: "请输入模板标题" },
            { max: 120 },
          ]}
        >
          <Input maxLength={120} placeholder="请输入模板标题" />
        </Form.Item>
        <Form.Item
          name="description"
          label="模板简介"
          rules={[
            { required: true, whitespace: true, message: "请输入模板简介" },
            { max: 500 },
          ]}
        >
          <Input.TextArea
            rows={3}
            maxLength={500}
            placeholder="请输入模板简介"
          />
        </Form.Item>
        <Form.Item
          name="category"
          label="模板分类"
          rules={[{ required: true, message: "请选择模板分类" }]}
        >
          <Select
            placeholder="请选择模板分类"
            options={Object.entries(categoryMap).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="config"
          label="JSON 文件"
          rules={[{ required: true, message: "请上传有效的 JSON 文件" }]}
          extra="支持.json 文件，最大 512 KB。"
        >
          <JsonUpload disabled={busy} />
        </Form.Item>
        <Form.Item
          name="cover"
          label="封面图片"
          rules={[{ required: true, message: "请上传封面图片" }]}
          extra="支持 JPG、PNG、WebP，单张不超过 3 MB，建议 16:9。"
        >
          <CoverUpload disabled={busy} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function JsonUpload({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value?: Record<string, unknown>;
  onChange?: (value: Record<string, unknown> | undefined) => void;
}) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<UploadFile[]>([]);
  return (
    <Upload.Dragger
      accept=".json,application/json"
      maxCount={1}
      disabled={disabled}
      fileList={value ? files : []}
      onRemove={() => {
        setFiles([]);
        onChange?.(undefined);
      }}
      beforeUpload={async (file) => {
        if (
          !file.name.toLowerCase().endsWith(".json") ||
          file.size > 512 * 1024
        ) {
          message.error("请上传不超过512 KB的 .json 文件");
          return Upload.LIST_IGNORE;
        }
        try {
          const config: unknown = JSON.parse(await file.text());
          if (!config || Array.isArray(config) || typeof config !== "object")
            throw new Error();
          onChange?.(config as Record<string, unknown>);
          setFiles([{ uid: file.uid, name: file.name, status: "done" }]);
        } catch {
          message.error("JSON 格式无效，请检查文件内容");
        }
        return Upload.LIST_IGNORE;
      }}
    >
      <UploadOutlined /> 上传 JSON
    </Upload.Dragger>
  );
}
function CoverUpload({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value?: File;
  onChange?: (value: File | undefined) => void;
}) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<UploadFile[]>([]);
  return (
    <Upload.Dragger
      accept="image/jpeg,image/png,image/webp"
      maxCount={1}
      listType="picture"
      disabled={disabled}
      fileList={value ? files : []}
      onRemove={() => {
        setFiles([]);
        onChange?.(undefined);
      }}
      beforeUpload={(file) => {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 3 * 1024 * 1024
        ) {
          message.error("请选择不超过3 MB的 JPG、PNG 或 WebP 图片");
          return Upload.LIST_IGNORE;
        }
        setFiles([
          {
            uid: file.uid,
            name: file.name,
            status: "done",
            originFileObj: file,
          },
        ]);
        onChange?.(file);
        return false;
      }}
    >
      <PictureOutlined /> 上传封面图
    </Upload.Dragger>
  );
}
