import { workflowConfig, type SlotValue } from "@/services/workflow";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Result,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  PictureOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { categoryMap } from "@/services/api";
import {
  creationMaterials,
  prepareCreation,
  saveCreation,
  workflowRun,
  startWorkflow,
} from "@/services/template-creations";
import type {
  CreationContext,
  PickMaterial,
  PublishTag,
} from "@/services/template-creations";
export default function VideoEditor() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get("templateId");
  if (!id)
    return (
      <Result
        status="info"
        title="请先选择模板"
        extra={
          <Button type="primary" onClick={() => navigate("/templates")}>
            前往模板市场
          </Button>
        }
      />
    );
  return <CreationLoader key={id} id={id} />;
}
function CreationLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["template-creation", id],
    queryFn: () => prepareCreation(id),
    staleTime: 0,
    retry: false,
  });
  if (query.isPending)
    return (
      <div className="p-12 text-center">
        <Spin />
      </div>
    );
  if (query.error)
    return (
      <Alert
        type="error"
        message={query.error.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  return (
    <CreationForm
      key={`${id}-${query.data.template.revision}`}
      context={query.data}
    />
  );
}
function CreationForm({ context }: { context: CreationContext }) {
  const { template, trackingTag, tags } = context;
  const workflow = workflowConfig(template.config);
  const [slotMaterials, setSlotMaterials] = useState<
    Record<string, PickMaterial>
  >({});
  const [slotFiles, setSlotFiles] = useState<Record<string, string>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [person, setPerson] = useState<PickMaterial | null>(null),
    [products, setProducts] = useState<PickMaterial[]>([]),
    [tagIds, setTagIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<"person" | "product" | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<{ id: string; status: string } | null>(null);
  const progress = useQuery({
    queryKey: ["workflow-run", saved?.id],
    queryFn: () => workflowRun(saved!.id),
    enabled: !!saved && !!workflow,
    refetchInterval: (query) =>
      ["queued", "generating"].includes(
        query.state.data?.status || saved?.status || "",
      )
        ? 5000
        : false,
  });
  const slotReady = workflow
    ? workflow.slots.every((s) => !!slotMaterials[s.nodeId])
    : !!person && !!products.length;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const topicTags = tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is PublishTag => !!t);
  const publishText = [
    ...topicTags.map((t) => `#${t.name || t.tag}`),
    `#${trackingTag.name || trackingTag.tag}`,
  ].join(" ");
  const changed = () => {
    setSaved(null);
    setRequestId(crypto.randomUUID());
  };
  const submit = async () => {
    const v = await form.validateFields();
    if (!slotReady) {
      message.warning("请选择人物素材和产品素材");
      return;
    }
    setBusy(true);
    try {
      const slotValues: Record<string, SlotValue> = {};
      for (const slot of workflow?.slots || [])
        slotValues[slot.nodeId] = {
          materialId: slotMaterials[slot.nodeId].id,
          ...(slotFiles[slot.nodeId]
            ? { assetId: slotFiles[slot.nodeId] }
            : {}),
        };
      const result = await saveCreation(template.id, {
        title: v.title,
        revision: template.revision,
        ...(workflow
          ? { slotValues }
          : {
              personMaterialId: person!.id,
              productMaterialIds: products.map((p) => p.id),
            }),
        tagIds,
        requestId,
      });
      setSaved(result);
      message.success(
        result.status === "queued" ? "已加入视频生成队列" : "生成配置已保存",
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="yp-page-header">
        <h1>AI 视频生成编辑</h1>
        <p>选择人物、产品素材与视频标签，使用模板生成品牌宣传视频</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card styles={{ body: { padding: 24 } }}>
          <div className="flex justify-between items-start mb-5 gap-3">
            <div>
              <h2 className="text-xl font-semibold m-0">模板预览</h2>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--yp-neutral-500)" }}
              >
                当前选择的模板封面
              </p>
            </div>
            <Button
              icon={<SwapOutlined />}
              disabled={busy}
              onClick={() => navigate("/templates")}
            >
              更换模板
            </Button>
          </div>
          <div
            className="mx-auto rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              width: "min(100%,320px)",
              aspectRatio: "9 / 16",
              background: "var(--yp-primary-50)",
            }}
          >
            {template.cover ? (
              <Image
                src={template.cover}
                alt={template.title}
                style={{
                  width: 320,
                  aspectRatio: "9 / 16",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                className="text-center"
                style={{ color: "var(--yp-neutral-500)" }}
              >
                <PictureOutlined style={{ fontSize: 48 }} />
                <p>该模板暂无封面</p>
              </div>
            )}
          </div>
          <div className="mt-5">
            <Space wrap>
              <h3 className="text-lg font-semibold m-0">{template.title}</h3>
              <Tag color="orange">{categoryMap[template.category]}</Tag>
              <Tag>v{template.revision}</Tag>
            </Space>
            <p
              className="text-sm mt-3 mb-0"
              style={{ color: "var(--yp-neutral-500)" }}
            >
              {template.description}
            </p>
          </div>
        </Card>
        <Card styles={{ body: { padding: 24 } }}>
          <h2 className="text-xl font-semibold m-0">生成配置</h2>
          <p
            className="text-sm mt-1 mb-5"
            style={{ color: "var(--yp-neutral-500)" }}
          >
            选择素材，配置视频信息
          </p>
          {!workflow && (
            <Space direction="vertical" size={16} className="w-full">
              <MaterialSlot
                title="人物展示插槽"
                description="选择人物形象，人物简介与音色将随生成配置保存"
                rows={person ? [person] : []}
                onPick={() => setPicker("person")}
                disabled={busy}
              />
              <MaterialSlot
                title="产品展示插槽"
                description="选择产品特写、细节图或多角度展示素材，最多 10 个产品"
                rows={products}
                onPick={() => setPicker("product")}
                disabled={busy}
              />
            </Space>
          )}
          <Form
            form={form}
            name="video-creation"
            layout="vertical"
            className="!mt-6"
            initialValues={{
              title: `${template.title}宣传视频`.slice(0, 50),
            }}
            disabled={busy}
            onValuesChange={changed}
          >
            {workflow && (
              <Space direction="vertical" size={16} className="w-full !mb-5">
                {context.execution && !context.execution.ready && (
                  <Alert
                    type="info"
                    showIcon
                    message={context.execution.reason}
                  />
                )}
                {workflow.slots.map((slot) => (
                  <div key={slot.nodeId}>
                    <MaterialSlot
                      title={slot.label}
                      description={`${slot.materialType === "product" ? "产品素材" : "人物素材"} · 替换节点输入图片`}
                      rows={
                        slotMaterials[slot.nodeId]
                          ? [slotMaterials[slot.nodeId]]
                          : []
                      }
                      disabled={busy}
                      onPick={() => {
                        setPickerSlot(slot.nodeId);
                        setPicker(slot.materialType as "product" | "person");
                      }}
                    />
                    {slot.field === "image" && slotMaterials[slot.nodeId] && (
                      <Select
                        aria-label={`${slot.label}使用图片`}
                        className="w-full !mt-2"
                        value={
                          slotFiles[slot.nodeId] ||
                          slotMaterials[slot.nodeId].files.find((f) =>
                            f.mimeType.startsWith("image/"),
                          )?.id
                        }
                        onChange={(id) => {
                          setSlotFiles((prev) => ({
                            ...prev,
                            [slot.nodeId]: id,
                          }));
                          changed();
                        }}
                        options={slotMaterials[slot.nodeId].files
                          .filter((f) => f.mimeType.startsWith("image/"))
                          .map((f, i) => ({
                            value: f.id,
                            label: (
                              <Space>
                                <Image
                                  src={f.url}
                                  width={32}
                                  height={32}
                                  preview={false}
                                  style={{ objectFit: "cover" }}
                                />
                                {f.label || `图片 ${i + 1}`}
                              </Space>
                            ),
                          }))}
                      />
                    )}
                  </div>
                ))}
              </Space>
            )}
            <Form.Item
              label={
                <Space>
                  视频标签
                  <Typography.Text type="secondary">
                    可多选 · {tagIds.length}/10
                  </Typography.Text>
                </Space>
              }
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                placeholder="搜索并选择标签管理中的标签"
                value={tagIds}
                onChange={(ids) => {
                  if (ids.length > 10) {
                    message.warning("最多选择10个内容标签");
                    return;
                  }
                  setTagIds(ids);
                  changed();
                }}
                options={tags.map((t) => ({
                  value: t.id,
                  label: `#${t.name || t.tag}`,
                }))}
                notFoundContent={
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无可用标签，请在标签管理中新增或启用"
                  />
                }
                style={{ width: "100%" }}
              />
            </Form.Item>
            <div
              className="rounded-lg p-3 mb-6"
              style={{
                background: "var(--yp-neutral-50)",
                border: "1px solid var(--yp-neutral-200)",
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">发布时携带的话题</span>
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(publishText)
                      .then(() => message.success("发布话题已复制"))
                      .catch(() =>
                        message.error("复制失败，请手动复制下方话题"),
                      );
                  }}
                >
                  复制
                </Button>
              </div>
              <Space wrap size={[4, 8]}>
                {topicTags.map((t) => (
                  <Tag key={t.id}>#{t.name || t.tag}</Tag>
                ))}
                <Tag color="orange">#{trackingTag.name || trackingTag.tag}</Tag>
              </Space>
              <p
                className="text-xs mt-2 mb-0"
                style={{ color: "var(--yp-neutral-500)" }}
              >
                橙色话题用于关联模板版本，发布时请一并保留；其他内容标签可自由组合。
              </p>
            </div>
            <Form.Item
              name="title"
              label="视频名称"
              rules={[
                { required: true, whitespace: true, message: "请输入视频名称" },
                { max: 50 },
              ]}
            >
              <Input placeholder="请输入视频名称" maxLength={50} showCount />
            </Form.Item>
            {saved && (
              <Alert
                className="!mb-4"
                type="info"
                showIcon
                message={
                  workflow
                    ? {
                        awaiting_provider: "生成配置已保存，等待配置模型服务",
                        queued: "已加入生成队列",
                        generating: "正在按模板流程生成视频",
                        completed: "视频生成完成",
                        failed: "视频生成失败",
                      }[progress.data?.status || saved.status] ||
                      "生成配置已保存"
                    : "生成配置已保存，等待接入大模型视频服务"
                }
                description={
                  <>
                    <div>任务编号：{saved.id}</div>
                    {workflow && (
                      <>
                        {progress.data?.error && (
                          <div>{progress.data.error}</div>
                        )}
                        {progress.error && <div>{progress.error.message}</div>}
                        {progress.data?.nodes.map((n) => (
                          <div key={n.id}>
                            {n.label}：
                            {{
                              queued: "等待中",
                              submitting: "提交中",
                              pending: "生成中",
                              completed: "已完成",
                              failed: "失败",
                            }[n.status] || n.status}
                          </div>
                        ))}
                        {(progress.data?.status || saved.status) ===
                          "awaiting_provider" && (
                          <Button
                            onClick={() =>
                              void startWorkflow(saved.id)
                                .then(() => progress.refetch())
                                .catch((e) => message.error(e.message))
                            }
                          >
                            配置服务后开始执行
                          </Button>
                        )}
                        <Button onClick={() => void progress.refetch()}>
                          刷新任务状态
                        </Button>
                      </>
                    )}
                    <Button
                      type="link"
                      className="!p-0"
                      onClick={() => navigate("/works")}
                    >
                      查看我的作品
                    </Button>
                  </>
                }
              />
            )}
            <Button
              type="primary"
              block
              size="large"
              icon={<ThunderboltOutlined />}
              loading={busy}
              disabled={!slotReady || !!saved}
              onClick={() => void submit().catch(() => undefined)}
            >
              开始生成
            </Button>
          </Form>
        </Card>
      </div>
      {picker && (
        <MaterialPicker
          type={picker}
          single={!!pickerSlot}
          initial={
            pickerSlot
              ? slotMaterials[pickerSlot]
                ? [slotMaterials[pickerSlot]]
                : []
              : picker === "person"
                ? person
                  ? [person]
                  : []
                : products
          }
          onCancel={() => {
            setPicker(null);
            setPickerSlot(null);
          }}
          onSave={(rows) => {
            if (pickerSlot) {
              setSlotMaterials((prev) => ({ ...prev, [pickerSlot]: rows[0] }));
              setSlotFiles((prev) => ({
                ...prev,
                [pickerSlot]:
                  rows[0]?.files.find((f) => f.mimeType.startsWith("image/"))
                    ?.id || "",
              }));
            } else if (picker === "person") setPerson(rows[0] || null);
            else setProducts(rows);
            setPicker(null);
            setPickerSlot(null);
            changed();
          }}
        />
      )}
    </div>
  );
}
function MaterialSlot({
  title,
  description,
  rows,
  onPick,
  disabled,
}: {
  title: string;
  description: string;
  rows: PickMaterial[];
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ border: "1px solid var(--yp-neutral-200)" }}
    >
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="text-base font-semibold m-0">{title}</h3>
          <p
            className="text-xs mt-1 mb-3"
            style={{ color: "var(--yp-neutral-500)" }}
          >
            {description}
          </p>
        </div>
        <Button disabled={disabled} onClick={onPick}>
          {rows.length ? "更换素材" : "选择素材"}
        </Button>
      </div>
      {rows.length > 0 ? (
        <Space wrap>
          {rows.map((m) => (
            <div key={m.id} style={{ width: 92 }}>
              {m.files[0] ? (
                <Image
                  src={m.files[0].url}
                  alt={m.name}
                  width={92}
                  height={72}
                  style={{ objectFit: "cover", borderRadius: 6 }}
                />
              ) : (
                <PictureOutlined />
              )}
              <Typography.Text ellipsis style={{ width: 92, fontSize: 12 }}>
                {m.name}
              </Typography.Text>
            </div>
          ))}
        </Space>
      ) : (
        <Typography.Text type="secondary">尚未选择素材</Typography.Text>
      )}
    </div>
  );
}
function MaterialPicker({
  single = false,
  type,
  initial,
  onCancel,
  onSave,
}: {
  type: "person" | "product";
  single?: boolean;
  initial: PickMaterial[];
  onCancel: () => void;
  onSave: (rows: PickMaterial[]) => void;
}) {
  const { message } = App.useApp();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<PickMaterial[]>(initial);
  const query = useQuery({
    queryKey: ["creation-materials", type, search],
    queryFn: () => creationMaterials(type, search),
  });
  return (
    <Modal
      open
      title={type === "person" ? "选择人物素材" : "选择产品素材"}
      width={800}
      onCancel={onCancel}
      okText={`确定（${selected.length}）`}
      okButtonProps={{ disabled: !selected.length }}
      onOk={() => onSave(selected)}
    >
      <Input.Search
        className="!my-4"
        placeholder="搜索素材名称"
        allowClear
        onSearch={setSearch}
        maxLength={120}
      />
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <Table<PickMaterial>
        rowKey="id"
        loading={query.isPending}
        dataSource={query.data || []}
        pagination={{ pageSize: 6 }}
        rowSelection={{
          type: single || type === "person" ? "radio" : "checkbox",
          selectedRowKeys: selected.map((m) => m.id),
          preserveSelectedRowKeys: true,
          onChange: (keys) => {
            if (keys.length > 10) {
              message.warning("最多选择10个产品素材");
              return;
            }
            const pool = new Map(
              [...selected, ...(query.data || [])].map((m) => [m.id, m]),
            );
            setSelected(
              keys.flatMap((k) =>
                pool.get(String(k)) ? [pool.get(String(k))!] : [],
              ),
            );
          },
        }}
        columns={[
          {
            title: "预览",
            width: 100,
            render: (_, m) =>
              m.files[0] ? (
                <Image
                  src={m.files[0].url}
                  alt={m.name}
                  width={64}
                  height={64}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                "—"
              ),
          },
          {
            title: "素材名称",
            dataIndex: "name",
            render: (name, m) => (
              <Space>
                {name}
                {m.isDefault && <Tag color="orange">默认</Tag>}
              </Space>
            ),
          },
          {
            title: type === "product" ? "素材描述" : "简介",
            render: (_, m) =>
              type === "product"
                ? m.materialDescription || "—"
                : m.description || "—",
            ellipsis: true,
          },
        ]}
      />
      <Typography.Text type="secondary">
        展示最近 100 条匹配素材，可搜索缩小范围。
      </Typography.Text>
    </Modal>
  );
}
