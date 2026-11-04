import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  DatePicker,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { formatDate, formatSize } from "@/services/api";
import {
  downloadable,
  fetchWorkLibrary,
  fetchWorkOptions,
  hashtags,
} from "@/services/work-library";
import type {
  LibraryWork,
  WorkFilters,
  WorkTaskStatus,
} from "@/services/work-library";
const statusMap: Record<WorkTaskStatus, { label: string; color: string }> = {
  awaiting_provider: { label: "待接入生成服务", color: "default" },
  queued: { label: "排队中", color: "warning" },
  generating: { label: "生成中", color: "processing" },
  completed: { label: "已完成", color: "success" },
  failed: { label: "失败", color: "error" },
};
function FileInfo({ work }: { work: LibraryWork }) {
  const parts = [
    work.mimeType?.split("/")[1]?.toUpperCase(),
    work.width && work.height ? `${work.width}×${work.height}` : null,
    work.size != null ? formatSize(work.size) : null,
  ].filter(Boolean);
  return (
    <Typography.Text type="secondary" className="text-xs">
      {parts.join(" · ") || "尚无视频文件"}
    </Typography.Text>
  );
}
export default function Works() {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<WorkFilters>({}),
    [keyword, setKeyword] = useState(""),
    [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [selected, setSelected] = useState<React.Key[]>([]),
    [preview, setPreview] = useState<LibraryWork | null>(null),
    [downloadsOpen, setDownloadsOpen] = useState(false);
  const [urlParams] = useSearchParams();
  const urlQuery = urlParams.get("q") || "";
  useEffect(() => {
    setFilters((f) => ({ ...f, q: urlQuery || undefined }));
    setKeyword(urlQuery);
    setPage(1);
    setSelected([]);
  }, [urlQuery]);
  const query = useQuery({
    queryKey: ["work-library", filters, page, pageSize],
    queryFn: () => fetchWorkLibrary({ ...filters, page, pageSize }),
  });
  const options = useQuery({
    queryKey: ["work-library-options"],
    queryFn: fetchWorkOptions,
  });
  const change = (next: Partial<WorkFilters>) => {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
    setSelected([]);
    setDownloadsOpen(false);
  };
  const reset = () => {
    setFilters({});
    setKeyword("");
    setRange(null);
    setPage(1);
    setSelected([]);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success("已复制，可粘贴到社交平台");
    } catch {
      message.error("复制失败，请手动选择并复制文本");
    }
  };
  const selectedWorks = (query.data?.items || []).filter(
    (w) => selected.includes(w.id) && downloadable(w),
  );
  return (
    <div className="space-y-5">
      <div className="yp-page-header">
        <h1>我的作品</h1>
        <p>集中查看视频作品，下载视频并复制文案与话题，手动发布到社交平台。</p>
      </div>
      <div className="yp-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Input.Search
            aria-label="搜索作品名称"
            placeholder="搜索作品名称"
            allowClear
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              if (!e.target.value) change({ q: undefined });
            }}
            onSearch={(v) => change({ q: v.trim() || undefined })}
          />
          <Select
            aria-label="按人物素材筛选"
            placeholder="请选择人物素材"
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.personId}
            options={options.data?.persons || []}
            onChange={(personId) => change({ personId })}
          />
          <Select
            aria-label="按产品素材筛选"
            placeholder="请选择产品素材"
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.productId}
            options={options.data?.products || []}
            onChange={(productId) => change({ productId })}
          />
          <Select
            aria-label="按模板筛选"
            placeholder="请选择模板"
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.templateId}
            options={options.data?.templates || []}
            onChange={(templateId) => change({ templateId })}
          />
          <DatePicker.RangePicker
            className="md:col-span-2"
            aria-label="生成时间"
            showTime
            format="YYYY-MM-DD HH:mm:ss"
            value={range}
            onChange={(v) => {
              const next = v as [Dayjs, Dayjs] | null;
              setRange(next);
              change({
                from: next?.[0].toISOString(),
                to: next?.[1].add(1, "second").toISOString(),
              });
            }}
          />
          <Select
            aria-label="任务状态"
            placeholder="请选择状态"
            allowClear
            value={filters.status}
            options={Object.entries(statusMap).map(([value, v]) => ({
              value,
              label: v.label,
            }))}
            onChange={(status) => change({ status })}
          />
          <div className="flex justify-end gap-2">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void query.refetch();
                void options.refetch();
              }}
            >
              刷新
            </Button>
            <Button onClick={reset}>重置</Button>
          </div>
        </div>
        <Typography.Text type="secondary" className="text-xs block mt-3">
          人物素材和产品素材按生成时保存的信息筛选，历史素材删除后仍可检索。
        </Typography.Text>
      </div>
      {options.error && (
        <Alert
          type="error"
          message={`筛选项加载失败：${options.error.message}`}
          action={<Button onClick={() => void options.refetch()}>重试</Button>}
        />
      )}
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div className="flex items-center justify-end gap-4">
        <span>已选择 {selectedWorks.length} 项</span>
        <Button
          icon={<DownloadOutlined />}
          disabled={!selectedWorks.length}
          onClick={() => setDownloadsOpen(true)}
        >
          下载已选
        </Button>
      </div>
      <div className="yp-card overflow-hidden">
        <Table<LibraryWork>
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items || []}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (w) => ({ disabled: !downloadable(w) }),
          }}
          pagination={{
            current: page,
            pageSize,
            total: query.data?.total || 0,
            showSizeChanger: true,
            showTotal: (n) => `共 ${n} 条作品`,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
              setSelected([]);
            },
          }}
          columns={[
            {
              title: "视频信息",
              width: 280,
              render: (_, w) => (
                <div className="flex items-center gap-3">
                  <Button
                    type="text"
                    aria-label={`预览${w.title}`}
                    disabled={!downloadable(w)}
                    onClick={() => setPreview(w)}
                    style={{
                      width: 76,
                      height: 64,
                      background: "var(--yp-primary-50)",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "relative",
                        display: "block",
                        width: 64,
                        height: 52,
                      }}
                    >
                      {downloadable(w) && (
                        <video
                          src={`${w.previewUrl}#t=0.1`}
                          preload="metadata"
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <PlayCircleOutlined
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%,-50%)",
                          fontSize: 26,
                          color: "var(--yp-primary-600)",
                          background: "rgba(255,255,255,.85)",
                          borderRadius: "50%",
                        }}
                      />
                    </span>
                  </Button>
                  <div className="min-w-0">
                    <Typography.Text strong>{w.title}</Typography.Text>
                    <div>
                      <FileInfo work={w} />
                    </div>
                    <Typography.Text type="secondary" className="text-xs">
                      {w.materials.map((m) => m.name).join(" · ") ||
                        w.templateName ||
                        "历史作品"}
                    </Typography.Text>
                  </div>
                </div>
              ),
            },
            {
              title: "生成时间",
              width: 170,
              render: (_, w) => (
                <div>
                  {formatDate(w.createdAt)}
                  {w.generationSeconds != null && (
                    <div className="text-xs text-gray-500">
                      耗时 {Math.floor(w.generationSeconds / 60)} 分{" "}
                      {w.generationSeconds % 60} 秒
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: "任务状态",
              width: 130,
              render: (_, w) => (
                <Tag color={statusMap[w.taskStatus]?.color || "default"}>
                  {statusMap[w.taskStatus]?.label || "待确认"}
                </Tag>
              ),
            },
            {
              title: "文案",
              width: 220,
              render: (_, w) =>
                w.caption ? (
                  <Typography.Paragraph
                    className="!mb-0"
                    ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
                    copyable={{ text: w.caption }}
                  >
                    {w.caption}
                  </Typography.Paragraph>
                ) : (
                  "—"
                ),
            },
            {
              title: "hashtag",
              width: 220,
              render: (_, w) =>
                w.publishTags.length ? (
                  <Typography.Paragraph
                    className="!mb-0 break-all"
                    ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
                    copyable={{ text: hashtags(w.publishTags) }}
                  >
                    {hashtags(w.publishTags)}
                  </Typography.Paragraph>
                ) : (
                  "—"
                ),
            },
            {
              title: "操作",
              width: 160,
              fixed: "right",
              render: (_, w) => (
                <Space>
                  <Button
                    type="link"
                    className="!p-0"
                    icon={<DownloadOutlined />}
                    href={downloadable(w) ? w.downloadUrl! : undefined}
                    disabled={!downloadable(w)}
                  >
                    下载
                  </Button>
                  <Button
                    type="link"
                    className="!p-0"
                    icon={<EyeOutlined />}
                    disabled={!downloadable(w)}
                    onClick={() => setPreview(w)}
                  >
                    预览
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal
        open={!!preview}
        title="视频预览"
        width={800}
        onCancel={() => setPreview(null)}
        footer={null}
        destroyOnClose
      >
        {preview && (
          <>
            <video
              key={preview.id}
              src={preview.previewUrl || undefined}
              controls
              preload="metadata"
              style={{
                width: "100%",
                maxHeight: "60vh",
                background: "#1c1917",
                borderRadius: 8,
              }}
            />
            <div className="flex justify-between items-center gap-4 mt-4">
              <div>
                <Typography.Title level={5}>{preview.title}</Typography.Title>
                <FileInfo work={preview} />
                <div className="text-xs text-gray-500 mt-1">
                  生成时间：{formatDate(preview.createdAt)}
                </div>
              </div>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                href={preview.downloadUrl || undefined}
              >
                下载
              </Button>
            </div>
            <div className="mt-4">
              <Typography.Paragraph
                copyable={preview.caption ? { text: preview.caption } : false}
              >
                {preview.caption || "暂无文案"}
              </Typography.Paragraph>
              <Typography.Paragraph
                copyable={
                  preview.publishTags.length
                    ? { text: hashtags(preview.publishTags) }
                    : false
                }
              >
                {hashtags(preview.publishTags) || "暂无 hashtag"}
              </Typography.Paragraph>
              <Button
                icon={<CopyOutlined />}
                disabled={!preview.caption && !preview.publishTags.length}
                onClick={() =>
                  void copy(
                    [preview.caption, hashtags(preview.publishTags)]
                      .filter(Boolean)
                      .join("\n"),
                  )
                }
              >
                复制文案和 hashtag
              </Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={downloadsOpen}
        title="下载已选作品"
        onCancel={() => setDownloadsOpen(false)}
        footer={<Button onClick={() => setDownloadsOpen(false)}>关闭</Button>}
      >
        <Typography.Paragraph type="secondary">
          请逐个保存视频文件，发布时请携带作品中的文案和完整 hashtag。
        </Typography.Paragraph>
        <Space direction="vertical" className="w-full">
          {selectedWorks.map((w) => (
            <div key={w.id} className="flex justify-between items-center gap-3">
              <span>{w.title}</span>
              <Button icon={<DownloadOutlined />} href={w.downloadUrl!}>
                下载
              </Button>
            </div>
          ))}
        </Space>
      </Modal>
    </div>
  );
}
