import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Cascader,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Upload,
  Image,
  Empty,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import MaterialImageUpload from "./MaterialImageUpload";
import { uploadHeaders, uploadErrorMessage } from "@/services/upload";
import { request, remove } from "@/services/api";
import {
  categoryOptions,
  categoryIds,
  fetchCategories,
  fetchVoices,
  saveMaterial,
  type Material,
  type MaterialFile,
  type Voice,
} from "@/services/materials";
interface Values {
  name: string;
  description?: string;
  categoryPath?: string[];
  tags?: string[];
  price?: number;
  voiceAssetId?: string;
  isDefault?: boolean;
}
export default function MaterialEditor({
  type,
  record,
  onClose,
  onSaved,
}: {
  type: Material["type"];
  record: Material | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const person = type === "person";
  const { message } = App.useApp();
  const client = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [files, setFiles] = useState<MaterialFile[]>(record?.files || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageMode, setImageMode] = useState("local");
  const [voicePreview, setVoicePreview] = useState<Voice | null>(null);
  const [generationReason, setGenerationReason] = useState("");
  const fresh = useRef(new Set<string>());
  const [imageUploadError, setImageUploadError] = useState(false);
  const [voiceUploads, setVoiceUploads] = useState<
    UploadFile<{ id: string }>[]
  >([]);
  const voices = useQuery({
    queryKey: ["material-voices"],
    queryFn: fetchVoices,
    enabled: person,
  });
  const capabilities = useQuery({
    queryKey: ["material-capabilities"],
    queryFn: () =>
      request<{ digitalHumanReady: boolean; reason: string }>(
        "/materials/capabilities",
      ),
    enabled: person,
  });
  const categories = useQuery({
    queryKey: ["material-categories"],
    queryFn: fetchCategories,
    enabled: !person,
  });
  const initializedCategory = useRef(false);
  useEffect(() => {
    if (person || !categories.data || initializedCategory.current) return;
    initializedCategory.current = true;
    const selected =
      record?.categoryId || categories.data.find((r) => r.system)?.id;
    form.setFieldValue("categoryPath", categoryIds(categories.data, selected));
  }, [categories.data, person, record?.categoryId, form]);
  const nickname = Form.useWatch("name", form);
  const voiceId = Form.useWatch("voiceAssetId", form);
  const close = async () => {
    if (uploading || saving) return;
    await Promise.allSettled(
      [...fresh.current].map((id) => remove(`/assets/${id}`)),
    );
    fresh.current.clear();
    onClose();
  };
  const persist = async (generate = false) => {
    if (imageUploadError) {
      message.error("请先移除上传失败的图片，再保存素材");
      return;
    }
    const v = await form.validateFields();
    if (!files.length) {
      message.error("请上传素材图片");
      return;
    }
    setSaving(true);
    try {
      const result = await saveMaterial(
        {
          type,
          name: v.name,
          description: v.description || "",
          categoryPath: [],
          categoryId: person ? undefined : v.categoryPath?.at(-1),
          tags: person ? [] : v.tags || [],
          priceCents: person ? 0 : Math.round((v.price || 0) * 100),
          fileIds: files.map((f) => f.id),
          voiceAssetId: person ? v.voiceAssetId : undefined,
          isDefault: person ? !!v.isDefault : false,
        },
        record?.id,
      );
      await Promise.allSettled(
        [...fresh.current]
          .filter((id) => !files.some((f) => f.id === id))
          .map((id) => remove(`/assets/${id}`)),
      );
      fresh.current.clear();
      if (generate) {
        await request(`/materials/${result.id}/generate`, { method: "POST" });
      }
      message.success(person ? "人物参考素材已保存" : "产品素材已保存");
      onSaved();
    } catch (e) {
      message.error(
        e instanceof Error
          ? e.message
          : generate
            ? "生成失败，请更换参考图重试"
            : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };
  const imageInput = (
    <MaterialImageUpload
      initialFiles={record?.files || []}
      maxCount={person ? 1 : 10}
      disabled={uploading || saving}
      onChange={setFiles}
      onBusyChange={setUploading}
      onErrorChange={setImageUploadError}
      onUploaded={(file) => fresh.current.add(file.id)}
    />
  );
  return (
    <Modal
      open
      title={`${record ? "编辑" : person ? "上传" : "上传"}${person ? "人物" : "产品素材"}`}
      width={person ? 1050 : 780}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      maskClosable={false}
      closable={!uploading && !saving}
      onCancel={() => void close()}
      footer={
        <Space>
          <Button disabled={uploading || saving} onClick={() => void close()}>
            取消
          </Button>
          {person && (
            <Button
              disabled={
                uploading ||
                saving ||
                imageUploadError ||
                !files.length ||
                !nickname?.trim() ||
                !voiceId
              }
              loading={saving}
              onClick={() => {
                if (!capabilities.data?.digitalHumanReady) {
                  setGenerationReason(
                    capabilities.data?.reason || "数字人引擎未配置",
                  );
                  return;
                }
                void persist(true).catch(() => undefined);
              }}
            >
              立即生成
            </Button>
          )}
          <Button
            type="primary"
            loading={saving || uploading}
            disabled={uploading || imageUploadError}
            onClick={() => void persist().catch(() => undefined)}
          >
            {person ? "保存参考素材" : "确定"}
          </Button>
        </Space>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: person
            ? "minmax(0,1.2fr) minmax(0,1fr)"
            : "minmax(0,1fr)",
          gap: 24,
        }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: record?.name || "",
            description: record?.description || "",
            categoryPath: [],
            tags: record?.tags || [],
            price: (record?.priceCents || 0) / 100,
            voiceAssetId: record?.voiceAssetId,
            isDefault: record?.isDefault || false,
          }}
        >
          <Form.Item label={person ? "形象图片" : "素材主图"} required>
            {person ? (
              <Tabs
                activeKey={imageMode}
                onChange={setImageMode}
                items={[
                  { key: "local", label: "本地上传", children: imageInput },
                  {
                    key: "ai",
                    label: "AI 生成",
                    children: (
                      <>
                        <Input.TextArea
                          placeholder="描述人物形象、服装和风格"
                          maxLength={500}
                        />
                        <Alert
                          className="mt-3"
                          type="info"
                          message="AI 生成参考图将在二期接入，当前请使用本地上传。"
                        />
                      </>
                    ),
                  },
                ]}
              />
            ) : (
              imageInput
            )}
          </Form.Item>
          <Form.Item
            name="name"
            label={person ? "昵称" : "素材标题"}
            rules={[
              {
                required: true,
                whitespace: true,
                message: person ? "请填写昵称" : "请填写素材标题",
              },
              { max: person ? 30 : 120 },
            ]}
          >
            <Input maxLength={person ? 30 : 120} showCount />
          </Form.Item>
          {!person && (
            <>
              <Form.Item
                name="categoryPath"
                label="素材类目"
                rules={[{ required: true }]}
              >
                <Cascader
                  options={categoryOptions(categories.data || [])}
                  disabled={categories.isPending}
                  expandTrigger="hover"
                  changeOnSelect
                  placeholder="未分类"
                />
              </Form.Item>
              <Form.Item name="price" label="价格（元）">
                <InputNumber
                  min={0}
                  max={9999999.99}
                  precision={2}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item name="tags" label="标签">
                <Select
                  mode="tags"
                  tokenSeparators={[",", "，"]}
                  maxCount={20}
                  placeholder="输入标签后按回车"
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="description"
            label={person ? "简介" : "素材卖点"}
            rules={
              person
                ? [{ max: 100 }]
                : [
                    {
                      required: true,
                      whitespace: true,
                      message: "请填写素材卖点",
                    },
                    { max: 500 },
                  ]
            }
          >
            <Input.TextArea rows={3} maxLength={person ? 100 : 500} showCount />
          </Form.Item>
          {person && (
            <>
              <Form.Item
                name="voiceAssetId"
                label="音色"
                rules={[{ required: true, message: "请选择音色" }]}
              >
                <Select
                  loading={voices.isPending}
                  placeholder="选择音色"
                  options={voices.data?.map((v) => ({
                    value: v.id,
                    label: v.name,
                  }))}
                  optionRender={(option) => (
                    <div className="flex justify-between items-center gap-3">
                      <span>{option.label}</span>
                      <Button
                        size="small"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoicePreview(
                            voices.data!.find((v) => v.id === option.value)!,
                          );
                        }}
                      >
                        试听
                      </Button>
                    </div>
                  )}
                />
              </Form.Item>
              <Space wrap>
                <Button
                  onClick={() => {
                    const v = voices.data?.find((v) => v.id === voiceId);
                    if (v) setVoicePreview(v);
                  }}
                  disabled={!voiceId}
                >
                  试听所选音色
                </Button>
                <Upload<{ id: string }>
                  action="/api/v1/assets"
                  name="file"
                  accept="audio/*"
                  withCredentials
                  headers={uploadHeaders}
                  data={(file) => ({
                    name: file.name.replace(/\.[^.]+$/, ""),
                    type: "voice",
                  })}
                  maxCount={1}
                  fileList={voiceUploads}
                  disabled={uploading || saving}
                  beforeUpload={(file) => {
                    if (
                      !file.type.startsWith("audio/") ||
                      !file.size ||
                      file.size > 50 * 1024 * 1024
                    ) {
                      message.error("请选择不超过 50 MB 的非空音频");
                      return Upload.LIST_IGNORE;
                    }
                    return true;
                  }}
                  onChange={(info) => {
                    const failure =
                      info.file.status === "error"
                        ? uploadErrorMessage(info.file)
                        : undefined;
                    setVoiceUploads(
                      info.fileList.map((file) =>
                        failure && file.uid === info.file.uid
                          ? { ...file, error: new Error(failure) }
                          : file,
                      ),
                    );
                    setUploading(
                      info.fileList.some((file) => file.status === "uploading"),
                    );
                    if (info.file.status === "done" && info.file.response) {
                      const id = info.file.response.id;
                      void client
                        .invalidateQueries({ queryKey: ["material-voices"] })
                        .then(() => form.setFieldValue("voiceAssetId", id));
                      message.success("音色参考音频已添加");
                    }
                    if (failure) message.error(failure);
                  }}
                >
                  <Button
                    icon={<UploadOutlined />}
                    disabled={uploading || saving}
                  >
                    添加音色参考音频
                  </Button>
                </Upload>
              </Space>
              <p className="text-xs my-2 text-gray-500">
                试听使用已上传的参考音频；正式合成音色需与数字人服务商映射。
              </p>
              {voicePreview && (
                <div className="my-3">
                  <div>{voicePreview.name}</div>
                  <audio
                    key={voicePreview.id}
                    src={voicePreview.sampleUrl}
                    controls
                    autoPlay
                    style={{ width: "100%" }}
                  />
                </div>
              )}
              <Form.Item name="isDefault" valuePropName="checked">
                <Checkbox>设为默认人物（当前组织唯一）</Checkbox>
              </Form.Item>
            </>
          )}
        </Form>
        {person && (
          <aside
            className="rounded-lg border p-4"
            style={{ background: "var(--yp-neutral-50)" }}
          >
            <h3 className="font-semibold mb-3">形象预览</h3>
            {files[0] ? (
              <Image
                width="100%"
                src={files[0].url}
                alt="人物参考预览"
                style={{
                  width: "100%",
                  maxHeight: 380,
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="上传后实时预览"
              />
            )}
            <Tag className="mt-3" color="orange">
              参考形象 · 尚未生成多角度
            </Tag>
            <Alert
              className="mt-4"
              type="info"
              message={
                generationReason || capabilities.data?.reason || "等待引擎配置"
              }
            />
            {saving && <p className="mt-3">正在保存人物参考素材…</p>}
          </aside>
        )}
      </div>
    </Modal>
  );
}
