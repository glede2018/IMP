import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
} from "antd";
import { request } from "@/services/api";
type Port = {
  id: string;
  type: string;
  multiple?: boolean;
  required?: boolean;
};
type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  default?: unknown;
  maxItems?: number;
  options?: { value: string | number; label: string }[];
};
type Model = {
  id: string;
  name: string;
  inputs: Port[];
  outputs: Port[];
  fields: Field[];
};
const parameters = (model: Model) =>
  model.fields.filter(
    (f) =>
      !model.inputs.some((p) => p.id === f.key) &&
      !/negative|负面/.test(f.key) &&
      ![
        "n",
        "num_images",
        "num_outputs",
        "model",
        "url",
        "endpoint",
        "apiKey",
        "authorization",
      ].includes(f.key),
  );
export default function MaterialViewModelFields({
  imageCount,
  required,
  type = "product",
}: {
  type?: "product" | "person";
  imageCount: number;
  required: boolean;
}) {
  const person = type === "person";
  const form = Form.useFormInstance();
  const modelId = Form.useWatch("viewModelId", form);
  const query = useQuery({
    queryKey: ["creatkey-models"],
    queryFn: () => request<Model[]>("/model-generations/models"),
    retry: false,
  });
  const models = (query.data || []).filter(
    (m) =>
      m.outputs.some((p) => p.type === "image") &&
      m.inputs.some((p) => p.type === "image" && (p.multiple || person)) &&
      m.inputs.some((p) => p.type === "text"),
  );
  const model = models.find((m) => m.id === modelId);
  const maxImages = (m: Model) => {
    const port =
      m.inputs.find((p) => p.type === "image" && p.multiple) ||
      m.inputs.find((p) => p.type === "image");
    return Math.min(
      port?.multiple ? 10 : 1,
      m.fields.find((f) => f.key === port?.id)?.maxItems || 10,
    );
  };
  return (
    <>
      {query.error && (
        <Alert
          className="mb-3"
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <Form.Item
        name="viewModelId"
        label="三视图生成模型"
        rules={[
          { required, message: "请选择三视图生成模型" },
          {
            validator: async (_, value) => {
              if (!value) return;
              if (!model) throw new Error("模型不可用，请重新选择");
              if (imageCount > maxImages(model))
                throw new Error(
                  `当前模型最多支持 ${maxImages(model)} 张参考图，请更换模型`,
                );
            },
          },
        ]}
      >
        <Select
          aria-label="三视图生成模型"
          placeholder={
            person ? "选择人物三视图模型" : "选择支持多张参考图的模型"
          }
          loading={query.isLoading}
          allowClear
          showSearch
          optionFilterProp="label"
          options={models.map((m) => ({
            value: m.id,
            label: `${m.name}（最多 ${maxImages(m)} 张参考图）`,
            disabled: imageCount > maxImages(m),
          }))}
          onChange={(id) => {
            const selected = models.find((m) => m.id === id);
            form.setFieldValue(
              "viewParameters",
              selected
                ? Object.fromEntries(
                    parameters(selected)
                      .filter(
                        (f) => f.default !== undefined && f.default !== "",
                      )
                      .map((f) => [f.key, f.default]),
                  )
                : {},
            );
          }}
        />
      </Form.Item>
      {!query.isLoading && !query.error && !models.length && (
        <Alert className="mb-3" type="info" message="暂无可用模型" />
      )}
      {model &&
        parameters(model).map((f) => (
          <Form.Item
            key={`${model.id}:${f.key}`}
            name={["viewParameters", f.key]}
            label={f.label}
            rules={[{ required: f.required, message: `请填写${f.label}` }]}
            valuePropName={f.type === "boolean" ? "checked" : "value"}
          >
            {f.type === "select" ? (
              <Select options={f.options} />
            ) : f.type === "number" ? (
              <InputNumber style={{ width: "100%" }} />
            ) : f.type === "boolean" ? (
              <Checkbox />
            ) : f.type === "textarea" ? (
              <Input.TextArea rows={3} />
            ) : (
              <Input />
            )}
          </Form.Item>
        ))}
    </>
  );
}
