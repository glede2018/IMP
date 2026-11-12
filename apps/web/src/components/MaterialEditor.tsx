import MaterialViewModelFields from "./MaterialViewModelFields";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  App,
  Button,
  Cascader,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
} from "antd";
import MaterialImageUpload from "./MaterialImageUpload";
import { remove } from "@/services/api";
import {
  categoryOptions,
  categoryIds,
  fetchCategories,
  saveMaterial,
  type Material,
  type MaterialFile,
} from "@/services/materials";
interface Values {
  viewModelId?: string;
  name: string;
  description?: string;
  categoryPath?: string[];
  materialDescription?: string;
  price?: number;
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
  const [form] = Form.useForm<Values>();
  const [files, setFiles] = useState<MaterialFile[]>(record?.files || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fresh = useRef(new Set<string>());
  const [imageUploadError, setImageUploadError] = useState(false);
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
  const viewModelId = Form.useWatch("viewModelId", form);
  const viewRequestId = useRef(crypto.randomUUID());
  const needsView =
    !(person ? record?.personView : record?.productView) ||
    JSON.stringify(files.map((f) => f.id)) !==
      JSON.stringify(record?.files.map((f) => f.id));
  const close = async () => {
    if (uploading || saving) return;
    await Promise.allSettled(
      [...fresh.current].map((id) => remove(`/assets/${id}`)),
    );
    fresh.current.clear();
    onClose();
  };
  const persist = async () => {
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
          ...(v.viewModelId
            ? {
                viewModelId: v.viewModelId,
                viewParameters: {},
                viewRequestId: viewRequestId.current,
              }
            : {}),
          name: v.name,
          description: v.description || "",
          categoryPath: [],
          categoryId: person ? undefined : v.categoryPath?.at(-1),
          tags: [],
          materialDescription: person ? "" : v.materialDescription || "",
          priceCents: person ? 0 : Math.round((v.price || 0) * 100),
          fileIds: files.map((f) => f.id),
        },
        record?.id,
      );
      await Promise.allSettled(
        [...fresh.current]
          .filter((id) => !files.some((f) => f.id === id))
          .map((id) => remove(`/assets/${id}`)),
      );
      fresh.current.clear();
      message.success(
        result.generationStatus === "generating"
          ? "素材已保存，三视图正在后台生成"
          : "素材已保存",
      );
      onSaved();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const imageInput = (
    <MaterialImageUpload
      materialType={person ? "person" : "product"}
      initialFiles={record?.files || []}
      maxCount={10}
      disabled={uploading || saving}
      onChange={(value) => {
        setFiles(value);
        viewRequestId.current = crypto.randomUUID();
      }}
      onBusyChange={setUploading}
      onErrorChange={setImageUploadError}
      onUploaded={(file) => fresh.current.add(file.id)}
    />
  );
  return (
    <Modal
      open
      title={`${record ? "编辑" : person ? "上传" : "上传"}${person ? "人物" : "产品素材"}`}
      width={780}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      maskClosable={false}
      closable={!uploading && !saving}
      onCancel={() => void close()}
      footer={
        <Space>
          <Button disabled={uploading || saving} onClick={() => void close()}>
            取消
          </Button>
          <Button
            type="primary"
            loading={saving || uploading}
            disabled={uploading || imageUploadError}
            onClick={() => void persist().catch(() => undefined)}
          >
            {needsView || viewModelId ? "保存并后台生成" : "保存"}
          </Button>
        </Space>
      }
    >
      <div>
        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          onValuesChange={() => {
            viewRequestId.current = crypto.randomUUID();
          }}
          initialValues={{
            name: record?.name || "",
            description: record?.description || "",
            categoryPath: [],
            materialDescription: record?.materialDescription || "",
            price: (record?.priceCents || 0) / 100,
          }}
        >
          <Form.Item label={person ? "形象图片" : "素材主图"} required>
            {imageInput}
          </Form.Item>
          <MaterialViewModelFields
            type={type}
            imageCount={files.length}
            required={needsView}
          />
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
              <Form.Item
                name="materialDescription"
                label="素材描述"
                rules={[{ max: 500, message: "素材描述最多500字" }]}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder="描述产品特点、外观或适用场景（选填）"
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
        </Form>
      </div>
    </Modal>
  );
}
