import ModelGenerationDialog from "@/components/ModelGenerationDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Button,
  DatePicker,
  Image,
  Input,
  Modal,
  Pagination,
  Popover,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMaterials, type Material } from "@/services/materials";
import { remove, formatDate } from "@/services/api";
import PageState from "@/components/PageState";
import MaterialEditor from "@/components/MaterialEditor";
function Media({
  material,
  large = false,
}: {
  material: Material;
  large?: boolean;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {material.files.map((file, index) =>
        file.mimeType.startsWith("video/") ? (
          <Popover
            key={file.id}
            trigger="hover"
            destroyTooltipOnHide
            content={
              <video
                src={file.url}
                muted
                autoPlay
                loop
                controls
                style={{ width: 360, maxHeight: 300 }}
              />
            }
          >
            <video
              src={file.url}
              muted
              preload="metadata"
              style={{
                width: large && index === 0 ? "100%" : 54,
                height: large && index === 0 ? 150 : 54,
                objectFit: "cover",
                borderRadius: 6,
              }}
              onMouseEnter={(e) => {
                void e.currentTarget.play().catch(() => undefined);
              }}
              onMouseLeave={(e) => e.currentTarget.pause()}
            />
          </Popover>
        ) : (
          <Popover
            key={file.id}
            trigger="hover"
            content={
              <img
                src={file.url}
                alt={`${material.name} ${index + 1}`}
                style={{ maxWidth: 360, maxHeight: 320, objectFit: "contain" }}
              />
            }
          >
            <Image
              src={file.url}
              alt={`${material.name} ${index + 1}`}
              width={large && index === 0 ? "100%" : 54}
              height={large && index === 0 ? 150 : 54}
              style={{ objectFit: "cover", borderRadius: 6 }}
              preview={{ mask: "预览" }}
            />
          </Popover>
        ),
      )}
    </div>
  );
}
export default function Assets() {
  const { canWrite } = useAuth();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [type, setType] = useState<Material["type"]>("product");
  const [keyword, setKeyword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [range, setRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState<Material>();
  const [editing, setEditing] = useState<Material | null | undefined>();
  const [preview, setPreview] = useState<Material | null>(null);
  const query = useQuery({
    queryKey: ["materials", type, keyword, ...range, sort, page],
    // 仅产品视图生成期间更新状态，任务结束即停止。
    refetchInterval: (q) =>
      q.state.data?.items.some((m) => m.generationStatus === "generating")
        ? 5000
        : false,
    queryFn: () =>
      fetchMaterials({
        type,
        q: keyword || undefined,
        from: range[0],
        to: range[1],
        sort,
        page,
        pageSize: 12,
      }),
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["material-categories"] });
    void client.invalidateQueries({ queryKey: ["materials"] });
    void client.invalidateQueries({ queryKey: ["overview"] });
  };
  const deleteItem = (record: Material) =>
    modal.confirm({
      title: "确认删除该素材？",
      content: (
        <p>
          删除后，
          <strong>
            历史已生成作品中引用的素材信息保留，新创作任务无法再选用该素材
          </strong>
        </p>
      ),
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(`/materials/${record.id}`);
          invalidate();
          if (query.data?.items.length === 1 && page > 1) setPage((p) => p - 1);
          message.success("素材已删除，历史引用已保留");
        } catch (e) {
          message.error(e instanceof Error ? e.message : "删除失败");
          throw e;
        }
      },
    });
  const actions = (m: Material) => (
    <Space size={12}>
      <Button type="link" disabled={!canWrite} onClick={() => setGenerating(m)}>
        生成三视图
      </Button>
      <Button type="link" disabled={!canWrite} onClick={() => setEditing(m)}>
        编辑
      </Button>
      <Button
        type="link"
        danger
        disabled={!canWrite}
        onClick={() => deleteItem(m)}
      >
        删除
      </Button>
    </Space>
  );
  const title = (m: Material) => (
    <>
      <Space wrap>
        <Button
          type="link"
          className="!p-0 font-medium"
          onClick={() => setPreview(m)}
        >
          {m.name}
        </Button>
      </Space>
      <div className="text-xs mt-1" style={{ color: "var(--yp-neutral-500)" }}>
        {m.creatorName} · {formatDate(m.createdAt)}
      </div>
    </>
  );
  return (
    <div className="space-y-4">
      <div className="yp-card p-5">
        <Tabs
          activeKey={type}
          onChange={(key) => {
            setType(key as Material["type"]);
            setKeyword("");
            setSearchText("");
            setRange([undefined, undefined]);
            setPage(1);
          }}
          items={[
            { key: "product", label: "产品素材" },
            { key: "person", label: "人物素材" },
          ]}
        />
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <Space wrap>
            <Input.Search
              aria-label="搜索素材"
              placeholder={
                type === "product"
                  ? "搜索素材名称、卖点、描述"
                  : "搜索人物素材名称"
              }
              allowClear
              style={{ width: 300 }}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (!e.target.value) {
                  setKeyword("");
                  setPage(1);
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
            />
            <DatePicker.RangePicker
              key={type}
              aria-label="创建时间"
              showTime={{ format: "HH:mm:ss" }}
              format="YYYY-MM-DD HH:mm:ss"
              onChange={(values) => {
                setRange([
                  values?.[0]?.toISOString(),
                  values?.[1]?.toISOString(),
                ]);
                setPage(1);
              }}
            />
            <Select
              aria-label="排序方式"
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
              }}
              options={[
                { value: "newest", label: "最新上传" },
                { value: "oldest", label: "最早上传" },
              ]}
              style={{ width: 130 }}
            />
          </Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!canWrite}
            onClick={() => setEditing(null)}
          >
            {type === "person" ? "上传人物" : "上传素材"}
          </Button>
        </div>
        <PageState
          loading={false}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.isPending ? (
          <div className="p-12 text-center">
            <Spin />
          </div>
        ) : (
          <Table<Material>
            rowKey="id"
            dataSource={query.data?.items}
            pagination={false}
            scroll={{ x: 1100 }}
            columns={[
              {
                title: type === "person" ? "人物素材名称" : "素材名称",
                render: (_, m) => title(m),
                width: 260,
              },
              ...(type === "product"
                ? [
                    {
                      title: "价格",
                      render: (_: unknown, m: Material) =>
                        `¥${(m.priceCents / 100).toFixed(2)}`,
                      width: 100,
                    },
                  ]
                : []),
              {
                title: type === "person" ? "参考图" : "素材预览图",
                render: (_, m) => (
                  <>
                    <Media material={m} />
                  </>
                ),
                width: 300,
              },
              {
                title: type === "person" ? "人物三视图" : "产品三视图",
                width: 180,
                render: (_: unknown, m: Material) => {
                  const view =
                    m.type === "person" ? m.personView : m.productView;
                  return view ? (
                    <Image
                      src={view.url}
                      width={100}
                      height={72}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <Tag
                      color={
                        m.generationStatus === "failed" ? "error" : "default"
                      }
                    >
                      {m.generationStatus === "generating"
                        ? "生成中"
                        : m.generationStatus === "failed"
                          ? "生成失败，可重试"
                          : "待生成"}
                    </Tag>
                  );
                },
              },
              ...(type === "product"
                ? [
                    {
                      title: "素材描述",
                      dataIndex: "materialDescription",
                      width: 220,
                      ellipsis: true,
                      render: (v: string) => v || "—",
                    },
                  ]
                : []),
              {
                title: "创建时间",
                dataIndex: "createdAt",
                render: formatDate,
                width: 180,
              },
              { title: "操作", render: (_, m) => actions(m), width: 220 },
            ]}
          />
        )}
        {!!query.data?.total && (
          <div className="mt-4 flex justify-end">
            <Pagination
              current={page}
              total={query.data.total}
              pageSize={12}
              showSizeChanger={false}
              showTotal={(total) => `共 ${total} 条素材`}
              onChange={setPage}
            />
          </div>
        )}
      </div>
      {generating && (
        <ModelGenerationDialog
          material={generating}
          onClose={() => setGenerating(undefined)}
          onSaved={() =>
            void client.invalidateQueries({ queryKey: ["materials"] })
          }
        />
      )}
      {editing !== undefined && (
        <MaterialEditor
          key={`${type}-${editing?.id || "new"}`}
          type={type}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            invalidate();
          }}
        />
      )}
      <Modal
        open={!!preview}
        title={preview?.name}
        onCancel={() => setPreview(null)}
        footer={<Button onClick={() => setPreview(null)}>关闭</Button>}
        width={850}
        destroyOnClose
      >
        {preview && (
          <>
            <Media material={preview} />
            {preview.type === "product" && (
              <p className="mt-4">
                素材描述：{preview.materialDescription || "—"}
              </p>
            )}
            <p className="mt-4">
              {preview.type === "product" ? "素材卖点：" : "简介："}
              {preview.description || "—"}
            </p>
            <div className="mt-2">
              {preview.creatorName} · {formatDate(preview.createdAt)}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
