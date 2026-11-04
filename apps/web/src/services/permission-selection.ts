// 管理与审核操作自动带上查看权限；撤销查看时同步移除依赖它的操作权限。
export function selectPermission(
  previous: string[],
  key: string,
  checked: boolean,
) {
  if (checked)
    return [
      ...new Set([
        ...previous,
        ...(key.includes(":") ? [key.split(":")[0]] : []),
        key,
      ]),
    ];
  return previous.filter(
    (value) =>
      value !== key && (key.includes(":") || !value.startsWith(`${key}:`)),
  );
}
