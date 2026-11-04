import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  TreeSelect,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { fetchCategories, type MaterialCategory } from "@/services/materials";
import { remove, save, formatDate } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
type Row = MaterialCategory & { children?: Row[] };
interface Values {
  name: string;
  parentId?: string;
  sort: number;
}
export default function MaterialCategories() {
  const { canWrite } = useAuth();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MaterialCategory | null | undefined>();
  const [parent, setParent] = useState<string>();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["material-categories"],
    queryFn: fetchCategories,
  });
  const rows = query.data || [];
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["material-categories"] }),
      client.invalidateQueries({ queryKey: ["materials"] }),
    ]);
  };
  const open = (record: MaterialCategory | null, parentId?: string) => {
    setEditing(record);
    setParent(parentId);
  };
  const blocked = new Set<string>(editing ? [editing.id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows)
      if (r.parentId && blocked.has(r.parentId) && !blocked.has(r.id)) {
        blocked.add(r.id);
        changed = true;
      }
  }
  const matches = new Set(
    rows
      .filter(
        (r) => !search || r.name.toLowerCase().includes(search.toLowerCase()),
      )
      .map((r) => r.id),
  );
  for (const id of matches) {
    let p = rows.find((r) => r.id === id)?.parentId;
    while (p) {
      matches.add(p);
      p = rows.find((r) => r.id === p)?.parentId;
    }
  }
  const tree = (parentId: string | null = null): Row[] =>
    rows
      .filter((r) => r.parentId === parentId && matches.has(r.id))
      .map((r) => {
        const children = tree(r.id);
        return { ...r, ...(children.length ? { children } : {}) };
      });
  const submit = async (v: Values) => {
    setBusy(true);
    try {
      await save(
        `/material-categories${editing ? `/${editing.id}` : ""}`,
        { ...v, parentId: v.parentId || null },
        editing ? "PUT" : "POST",
      );
      await invalidate();
      setEditing(undefined);
      message.success("分类已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  const deleteCategory = (r: MaterialCategory) =>
    modal.confirm({
      title: `确认删除分类“${r.name}”？`,
      content:
        "存在子分类或被素材使用的分类不能删除。历史作品中的分类信息会保留。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(`/material-categories/${r.id}`);
          await invalidate();
          message.success("分类已删除");
        } catch (e) {
          message.error(e instanceof Error ? e.message : "删除失败");
        }
      },
    });
  return (
    <div>
      <div className="yp-page-header">
        <h1>素材分类</h1>
        <p>管理产品素材的多级分类，最多支持五级</p>
      </div>
      <div className="yp-card p-4 mb-4 flex justify-between gap-4 flex-wrap">
        <Space>
          <Input
            className="yp-search-field"
            aria-label="搜索分类"
            placeholder="搜索分类名称"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => setSearch(keyword.trim())}
          />
          <Button type="primary" onClick={() => setSearch(keyword.trim())}>
            查询
          </Button>
          <Button
            onClick={() => {
              setKeyword("");
              setSearch("");
            }}
          >
            重置
          </Button>
        </Space>
        <Button
          type="primary"
          disabled={!canWrite}
          icon={<PlusOutlined />}
          onClick={() => open(null)}
        >
          新增分类
        </Button>
      </div>
      {query.error && (
        <Alert
          type="error"
          message={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div className="yp-card overflow-hidden">
        <Table<Row>
          key={`${search}-${query.dataUpdatedAt}`}
          rowKey="id"
          dataSource={tree()}
          loading={query.isPending}
          pagination={false}
          expandable={{ defaultExpandAllRows: true }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: "分类名称",
              dataIndex: "name",
              render: (name: string, r) => (
                <Space>
                  {name}
                  {r.system && <Tag color="orange">系统分类</Tag>}
                </Space>
              ),
            },
            { title: "排序", dataIndex: "sort", width: 90 },
            {
              title: "素材数量",
              render: (_, r) => r._count.materials,
              width: 110,
            },
            {
              title: "创建时间",
              dataIndex: "createdAt",
              render: formatDate,
              width: 210,
            },
            {
              title: "操作",
              width: 240,
              render: (_, r) => (
                <Space size={12}>
                  <Button
                    type="link"
                    disabled={!canWrite || r.system}
                    onClick={() => open(null, r.id)}
                  >
                    新增子分类
                  </Button>
                  <Button
                    type="link"
                    disabled={!canWrite || r.system}
                    onClick={() => open(r)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    disabled={!canWrite || r.system}
                    onClick={() => deleteCategory(r)}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
      {editing !== undefined && (
        <CategoryEditor
          record={editing}
          parentId={parent}
          rows={rows}
          blocked={blocked}
          busy={busy}
          onCancel={() => {
            if (!busy) setEditing(undefined);
          }}
          onSave={submit}
        />
      )}
    </div>
  );
}

function CategoryEditor({
  record,
  parentId,
  rows,
  blocked,
  busy,
  onCancel,
  onSave,
}: {
  record: MaterialCategory | null;
  parentId?: string;
  rows: MaterialCategory[];
  blocked: Set<string>;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: Values) => Promise<void>;
}) {
  const [form] = Form.useForm<Values>();
  return (
    <Modal
      open
      title={record ? "编辑分类" : "新增分类"}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={() =>
        void form
          .validateFields()
          .then(onSave)
          .catch(() => undefined)
      }
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: record?.name || "",
          parentId: record?.parentId || parentId,
          sort: record?.sort ?? 0,
        }}
        preserve={false}
      >
        <Form.Item
          name="name"
          label="分类名称"
          rules={[
            { required: true, whitespace: true, message: "请输入分类名称" },
            { max: 60 },
          ]}
        >
          <Input maxLength={60} showCount />
        </Form.Item>
        <Form.Item name="parentId" label="上级分类">
          <TreeSelect
            allowClear
            placeholder="无（一级分类）"
            treeDefaultExpandAll
            treeDataSimpleMode
            treeData={rows.map((r) => ({
              id: r.id,
              pId: r.parentId || undefined,
              value: r.id,
              title: r.name,
              disabled: r.system || blocked.has(r.id),
            }))}
          />
        </Form.Item>
        <Form.Item name="sort" label="排序" rules={[{ required: true }]}>
          <InputNumber min={0} max={9999} />
        </Form.Item>
        <p className="text-xs text-gray-500">
          修改分类名称或层级后，在用素材的分类路径会同步更新，历史作品快照不变。
        </p>
      </Form>
    </Modal>
  );
}
