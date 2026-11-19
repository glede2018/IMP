// 添加模板需要同时访问模板列表与模板市场，其余操作按模块匹配查看权限。
const dependencies = (key: string) =>
  key === "templates:create"
    ? ["templates", "template-catalog"]
    : key.includes(":")
      ? [key.split(":")[0]]
      : [];

// 管理与审核操作自动带上查看权限；撤销查看时同步移除依赖它的操作权限。
export function selectPermission(
  previous: string[],
  key: string,
  checked: boolean,
) {
  if (checked) return [...new Set([...previous, ...dependencies(key), key])];
  return previous.filter(
    (value) => value !== key && !dependencies(value).includes(key),
  );
}
