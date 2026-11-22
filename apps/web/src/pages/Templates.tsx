import TemplatePreview from "@/components/TemplatePreview";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Grid,
  Input,
  Popconfirm,
  message,
  Select,
  Skeleton,
  Space,
  Spin,
  Tag,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { categoryMap, getPage, save } from "@/services/api";
import type { Template } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
type Row = Template & { cover?: string | null };
export default function Templates() {
  const { user } = useAuth();
  const canManage =
    !!user &&
    (user.permissions.includes("*") ||
      user.permissions.includes("templates:write"));
  const queryClient = useQueryClient();
  const canUse =
    !!user &&
    (user.permissions.includes("*") ||
      ["works", "works:write", "assets"].every((key) =>
        user.permissions.includes(key),
      ));
  const [marketStatus, setMarketStatus] = useState("active");
  const availability = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      save(
        `/templates/${encodeURIComponent(id)}/availability`,
        { active },
        "PATCH",
      ),
    onSuccess: (_data, vars) => {
      message.success(vars.active ? "模板已上架" : "模板已下架");
      void queryClient.invalidateQueries({ queryKey: ["template-market"] });
    },
    onError: (error: Error) => message.error(error.message),
  });
  const [urlParams] = useSearchParams();
  const urlQuery = urlParams.get("q") || "";
  const navigate = useNavigate();
  const [search, setSearch] = useState(""),
    [keyword, setKeyword] = useState(""),
    [category, setCategory] = useState<string>();
  const screens = Grid.useBreakpoint();
  const columnCount = screens.xl
    ? 5
    : screens.lg
      ? 4
      : screens.md
        ? 3
        : screens.sm
          ? 2
          : 1;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSearch(urlQuery);
    setKeyword(urlQuery);
  }, [urlQuery]);
  const query = useInfiniteQuery({
    queryKey: [
      "template-market",
      "infinite",
      keyword,
      category,
      canManage ? marketStatus : "active",
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getPage<Row>("/templates", {
        q: keyword,
        category,
        page: pageParam,
        pageSize: 20,
        marketStatus: canManage ? marketStatus : "active",
      }),
    getNextPageParam: (lastPage) =>
      lastPage.items.length &&
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
  });
  const { fetchNextPage, hasNextPage, isFetching, isFetchNextPageError } =
    query;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetching || isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          void fetchNextPage({ cancelRefetch: false });
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchNextPageError]);
  const templates = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) || []).map((t) => [
        t.id,
        t,
      ]),
    ).values(),
  ];
  // 每列独立追加卡片，避免加载下一批时整列重新平衡导致画面跳动。
  const columns = Array.from({ length: columnCount }, (_, index) =>
    templates.filter((_, i) => i % columnCount === index),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Space wrap size={16}>
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
              }
            }}
            onSearch={(v) => {
              setKeyword(v.trim());
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
            }}
            options={Object.entries(categoryMap).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          {canManage && (
            <Select
              aria-label="模板上架状态"
              value={marketStatus}
              style={{ width: 140 }}
              options={[
                { value: "active", label: "上架中" },
                { value: "inactive", label: "已下架" },
                { value: "all", label: "全部状态" },
              ]}
              onChange={(value) => {
                setMarketStatus(value);
              }}
            />
          )}
        </Space>
      </div>
      {query.error && !query.isFetchNextPageError && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div
        className="grid items-start gap-4"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((column, index) => (
          <div key={index} className="min-w-0">
            {query.isPending
              ? Array.from({ length: 2 }, (_, i) => (
                  <Card key={i} style={{ marginBottom: 16 }}>
                    <Skeleton active />
                  </Card>
                ))
              : column.map((t) => (
                  <Card
                    key={t.id}
                    styles={{ body: { padding: 12 } }}
                    className="overflow-hidden"
                    style={{ marginBottom: 16 }}
                    cover={
                      <TemplatePreview
                        id={t.id}
                        title={t.title}
                        cover={t.cover}
                      />
                    }
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h3 className="text-base font-semibold m-0 min-w-0 break-words">
                        {t.title}
                      </h3>
                      <Space size={0} wrap className="shrink-0">
                        <Tag color="orange">{categoryMap[t.category]}</Tag>
                        {!t.active && <Tag>已下架</Tag>}
                      </Space>
                    </div>
                    <p
                      className="text-sm mb-3"
                      style={{
                        color: "var(--yp-neutral-500)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {t.description}
                    </p>
                    <Button
                      type="primary"
                      block
                      disabled={!canUse || !t.active}
                      onClick={() =>
                        navigate(
                          `/video-editor?templateId=${encodeURIComponent(t.id)}`,
                        )
                      }
                    >
                      {t.active ? "使用模板" : "已下架"}
                    </Button>
                    {canManage && (
                      <Popconfirm
                        title={
                          t.active ? "确认下架该模板？" : "确认重新上架该模板？"
                        }
                        description={
                          t.active
                            ? "下架后无法用于新创作，已有作品和已提交任务保留。"
                            : "上架后可再次使用该模板创建视频。"
                        }
                        okText="确定"
                        cancelText="取消"
                        onConfirm={() =>
                          availability
                            .mutateAsync({ id: t.id, active: !t.active })
                            .catch(() => undefined)
                        }
                      >
                        <Button
                          block
                          danger={t.active}
                          style={{ marginTop: 8 }}
                          loading={
                            availability.isPending &&
                            availability.variables?.id === t.id
                          }
                        >
                          {t.active ? "下架" : "重新上架"}
                        </Button>
                      </Popconfirm>
                    )}
                  </Card>
                ))}
          </div>
        ))}
      </div>
      {!query.isPending && !query.error && !templates.length && (
        <Empty description="暂无匹配的模板" />
      )}
      <div ref={loadMoreRef} className="py-4 text-center" aria-live="polite">
        {query.isFetchNextPageError ? (
          <Alert
            type="error"
            message={`加载更多失败：${query.error?.message || "请重试"}`}
            action={
              <Button
                loading={query.isFetchingNextPage}
                onClick={() =>
                  void query.fetchNextPage({ cancelRefetch: false })
                }
              >
                重试
              </Button>
            }
          />
        ) : query.isFetchingNextPage ? (
          <Space>
            <Spin size="small" />
            <span>加载中…</span>
          </Space>
        ) : templates.length > 0 && !query.hasNextPage ? (
          <span className="text-sm text-gray-400">没有更多模板了</span>
        ) : null}
      </div>
    </div>
  );
}
