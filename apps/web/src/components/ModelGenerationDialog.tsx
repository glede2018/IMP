import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Form, Image, Modal, Space, Spin } from "antd";
import MaterialViewModelFields from "./MaterialViewModelFields";
import { request } from "@/services/api";
import type { Material } from "@/services/materials";
type Job = {
  id: string;
  status: string;
  error?: string;
  images: { id: string; url: string }[];
  purpose: string;
};
export default function ModelGenerationDialog({
  material,
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: () => void;
}) {
  const person = material.type === "person";
  const purpose = person ? "person_views" : "product_views";
  const currentJobId = person
    ? material.personViewJobId
    : material.productViewJobId;
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const modelId = Form.useWatch("viewModelId", form);
  const [jobId, setJobId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const resumed = useRef(false);
  const notified = useRef<string>();
  const history = useQuery({
    queryKey: ["model-generation-history", material.id, purpose],
    queryFn: () =>
      request<Job[]>(
        `/model-generations?materialId=${encodeURIComponent(material.id)}`,
      ).then((rows) => rows.filter((j) => j.purpose === purpose)),
    retry: false,
  });
  useEffect(() => {
    if (!history.data || resumed.current) return;
    resumed.current = true;
    const active = history.data.find(
      (j) => j.id === currentJobId && ["queued", "running"].includes(j.status),
    );
    if (active) setJobId(active.id);
  }, [history.data, currentJobId]);
  const job = useQuery({
    queryKey: ["model-generation", jobId],
    queryFn: () => request<Job>(`/model-generations/${jobId}`),
    enabled: !!jobId,
    retry: false,
    refetchInterval: (q) =>
      q.state.error ||
      (q.state.data && ["completed", "failed"].includes(q.state.data.status))
        ? false
        : 3000,
  });
  useEffect(() => {
    if (job.data?.status === "completed" && notified.current !== job.data.id) {
      notified.current = job.data.id;
      onSaved();
    }
  }, [job.data, onSaved]);
  const running =
    !!jobId && !["completed", "failed"].includes(job.data?.status || "");
  async function submit() {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const result = await request<Job>(
        `/model-generations/${person ? "person" : "product"}-views`,
        {
          method: "POST",
          body: JSON.stringify({
            materialId: material.id,
            modelId: values.viewModelId,
            requestId: requestId.current,
            parameters: {},
          }),
        },
      );
      setJobId(result.id);
      void history.refetch();
      onSaved();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={person ? "生成人物三视图" : "生成产品三视图"}
      width={760}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          {job.data?.status === "failed" && (
            <Button
              onClick={() => {
                setJobId(undefined);
                requestId.current = crypto.randomUUID();
              }}
            >
              重新生成
            </Button>
          )}
          {!jobId && (
            <Button
              type="primary"
              disabled={!modelId || history.isLoading}
              loading={busy}
              onClick={() => void submit().catch(() => undefined)}
            >
              生成三视图
            </Button>
          )}
        </Space>
      }
    >
      {!jobId && (
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onValuesChange={() => {
            requestId.current = crypto.randomUUID();
          }}
        >
          <MaterialViewModelFields
            type={material.type}
            imageCount={material.files.length}
            required
          />
        </Form>
      )}
      {history.error && (
        <Alert
          type="error"
          message={history.error.message}
          action={<Button onClick={() => void history.refetch()}>重试</Button>}
        />
      )}
      {running && !job.error && (
        <Spin tip="生成中">
          <div style={{ height: 72 }} />
        </Spin>
      )}
      {!jobId && !!history.data?.length && (
        <div className="mt-4">
          <p>生成记录</p>
          <Space wrap>
            {history.data.map((j, i) => (
              <Button key={j.id} size="small" onClick={() => setJobId(j.id)}>
                {i + 1} ·{" "}
                {j.status === "completed"
                  ? "查看结果"
                  : j.status === "failed"
                    ? "查看失败原因"
                    : "查看进度"}
              </Button>
            ))}
          </Space>
        </div>
      )}
      {job.error && (
        <Alert
          type="error"
          message={job.error.message}
          action={<Button onClick={() => void job.refetch()}>重试</Button>}
        />
      )}
      {job.data?.error && (
        <Alert
          type={job.data.status === "failed" ? "error" : "warning"}
          message={job.data.error}
        />
      )}
      {job.data?.status === "completed" && (
        <Image.PreviewGroup>
          <Space wrap>
            {job.data.images.map((i) => (
              <Image key={i.id} src={i.url} width={160} />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
    </Modal>
  );
}
