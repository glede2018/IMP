import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Modal,
  Spin,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getPage } from "@/services/api";
import { fetchWorkLibrary } from "@/services/work-library";
export default function GlobalSearch() {
  const { user } = useAuth(),
    navigate = useNavigate();
  const [text, setText] = useState(""),
    [term, setTerm] = useState(""),
    [open, setOpen] = useState(false);
  const scopes = [
    { key: "accounts", label: "账号", path: "/accounts" },
    { key: "templates", label: "模板", path: "/templates" },
    { key: "works", label: "作品", path: "/works" },
  ].filter(
    (s) => user?.permissions.includes("*") || user?.permissions.includes(s.key),
  );
  const result = useQuery({
    queryKey: ["global-search", term, scopes.map((s) => s.key).join(",")],
    enabled: open && !!term,
    queryFn: async () => {
      return Promise.all(
        scopes.map(async (scope) => {
          try {
            const data =
              scope.key === "works"
                ? await fetchWorkLibrary({ q: term, page: 1, pageSize: 5 })
                : await getPage<{
                    id: string;
                    title?: string;
                    nickname?: string;
                    accountId?: string;
                  }>(scope.path, { q: term, page: 1, pageSize: 5 });
            return {
              ...scope,
              total: data.total,
              items: data.items.map((item) => ({
                id: item.id,
                name:
                  ("nickname" in item ? item.nickname : undefined) ||
                  ("title" in item ? item.title : undefined) ||
                  item.id,
              })),
              error: null,
            };
          } catch (e) {
            return {
              ...scope,
              total: 0,
              items: [],
              error: e instanceof Error ? e.message : "搜索失败",
            };
          }
        }),
      );
    },
  });
  return (
    <>
      <Input.Search
        aria-label="全局搜索"
        placeholder="搜索账号、模板、作品"
        style={{ width: 256 }}
        value={text}
        allowClear
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        onSearch={(value) => {
          const next = value.trim();
          setTerm(next);
          setOpen(!!next);
        }}
      />
      <Modal
        open={open}
        title={`搜索“${term}”`}
        footer={<Button onClick={() => setOpen(false)}>关闭</Button>}
        onCancel={() => setOpen(false)}
        width={600}
      >
        {result.isPending ? (
          <div className="p-8 text-center">
            <Spin />
          </div>
        ) : (
          <>
            {!scopes.length && <Empty description="暂无可搜索的页面权限" />}
            {result.data?.map((group) => (
              <section key={group.key} className="mb-4">
                <div className="flex justify-between items-center">
                  <Typography.Text strong>
                    {group.label}（{group.total}）
                  </Typography.Text>
                  {group.total > 0 && (
                    <Button
                      type="link"
                      onClick={() => {
                        setOpen(false);
                        navigate(`${group.path}?q=${encodeURIComponent(term)}`);
                      }}
                    >
                      查看全部
                    </Button>
                  )}
                </div>
                {group.error ? (
                  <Alert type="error" message={group.error} />
                ) : (
                  <List
                    size="small"
                    dataSource={group.items}
                    locale={{ emptyText: "暂无匹配结果" }}
                    renderItem={(item) => (
                      <List.Item>
                        <Button
                          type="link"
                          className="!p-0"
                          onClick={() => {
                            setOpen(false);
                            navigate(
                              `${group.path}?q=${encodeURIComponent(item.name.slice(0, 100))}`,
                            );
                          }}
                        >
                          {item.name}
                        </Button>
                      </List.Item>
                    )}
                  />
                )}
              </section>
            ))}
          </>
        )}
      </Modal>
    </>
  );
}
