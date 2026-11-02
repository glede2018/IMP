import { useState } from "react";
import { Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import { getPage } from "@/services/api";
export default function RemoteSelect({
  path,
  id,
  label = "name",
  value,
  onChange,
  videoOnly = false,
  imageOnly = false,
}: {
  path: string;
  id?: string;
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  videoOnly?: boolean;
  imageOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: [path, { q, select: true }],
    queryFn: () =>
      getPage<{ id: string; mimeType?: string; [key: string]: unknown }>(path, {
        q,
        pageSize: 100,
      }),
  });
  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      allowClear
      showSearch
      filterOption={false}
      onSearch={setQ}
      loading={query.isFetching}
      placeholder="搜索并选择"
      options={query.data?.items
        .filter(
          (a) =>
            (!videoOnly || a.mimeType?.startsWith("video/")) &&
            (!imageOnly || a.mimeType?.startsWith("image/")),
        )
        .map((a) => ({ value: a.id, label: String(a[label]) }))}
      notFoundContent={query.error ? query.error.message : undefined}
    />
  );
}
