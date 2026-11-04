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
const deletionText =
  "确认删除该素材？删除后，历史已生成作品中引用的素材信息保留，新创作任务无法再选用该素材";
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
  const [editing, setEditing] = useState<Material | null | undefined>();
  const [preview, setPreview] = useState<Material | null>(null);
  const query = useQuery({
    queryKey: ["materials", type, keyword, ...range, sort, page],
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
        {m.isDefault && <Tag color="orange">默认</Tag>}
      </Space>
      <div className="text-xs mt-1" style={{ color: "var(--yp-neutral-500)" }}>
        {m.creatorName} · {formatDate(m.createdAt)}
      </div>
    </>
  );
  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>素材库</h1>
        <p>统一管理视频创作所需的产品与人物素材</p>
      </div>
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
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
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
                title: type === "person" ? "人物素材 ID" : "素材 ID",
                dataIndex: "id",
                width: 200,
                ellipsis: true,
              },
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
                title: type === "person" ? "多角度图" : "素材预览图",
                render: (_, m) => (
                  <>
                    <Media material={m} />
                    {type === "person" && m.generationStatus !== "ready" && (
                      <Tag className="mt-2">参考图 · 待生成多角度</Tag>
                    )}
                  </>
                ),
                width: 300,
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
              ...(type === "person"
                ? [
                    {
                      title: "音色",
                      dataIndex: "voiceName",
                      render: (v: string) => v || "未配置",
                      width: 140,
                    },
                  ]
                : [
                    {
                      title: "创建时间",
                      dataIndex: "createdAt",
                      render: formatDate,
                      width: 180,
                    },
                  ]),
              { title: "操作", render: (_, m) => actions(m), width: 140 },
            ]}
          />
        )}
        {!!query.data?.total && (
          <div className="mt-5 flex justify-end">
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
            <p className="mt-2 text-xs text-gray-500">{deletionText}</p>
          </>
        )}
      </Modal>
    </div>
  );
}
