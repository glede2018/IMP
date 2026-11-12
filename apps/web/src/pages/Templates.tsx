import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
  Input,
  Pagination,
  Popconfirm,
  message,
  Select,
  Skeleton,
  Space,
  Tag,
} from "antd";
import {
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { categoryMap, getPage, save } from "@/services/api";
import type { Template } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
type Row = Template & { cover?: string | null };
export default function Templates() {
  const { user } = useAuth();
  const canCreate =
    !!user &&
    (user.permissions.includes("*") ||
      user.permissions.includes("templates:create"));
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
    [category, setCategory] = useState<string>(),
    [page, setPage] = useState(1);
  useEffect(() => {
    setSearch(urlQuery);
    setKeyword(urlQuery);
    setPage(1);
  }, [urlQuery]);
  const query = useQuery({
    queryKey: [
      "template-market",
      keyword,
      category,
      page,
      canManage ? marketStatus : "active",
    ],
    queryFn: () =>
      getPage<Row>("/templates", {
        q: keyword,
        category,
        page,
        pageSize: 12,
        marketStatus: canManage ? marketStatus : "active",
      }),
  });
  return (
    <div className="space-y-5">
      <div className="yp-page-header flex justify-between items-start gap-4">
        <div>
          <h1>模板市场</h1>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canCreate}
          onClick={() => navigate("/template-catalog")}
        >
          导入模板
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
              setPage(1);
            }}
          />
        )}
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
                  <Space size={0}>
                    <Tag color="orange">{categoryMap[t.category]}</Tag>
                    {!t.active && <Tag>已下架</Tag>}
                  </Space>
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
    </div>
  );
}
