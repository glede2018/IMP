import type { AccessRole, User, UserRole } from "@prisma/client";
export const permissionCatalog = [
  ["home", "系统首页"],
  ["accounts", "账号管理"],
  ["templates", "模板市场"],
  ["assets", "素材库"],
  ["works", "我的作品"],
  ["strategy/product-selection", "选品策略"],
  ["strategy/social-monitor", "社媒监控"],
  ["strategy/topic", "营销策略"],
  ["analytics", "数据中心"],
  ["help", "帮助中心"],
  ["roles", "角色管理"],
  ["users", "用户管理"],
  ["accounts:write", "账号维护"],
  ["templates:write", "模板维护"],
  ["assets:write", "素材维护"],
  ["works:write", "作品维护"],
  ["works:review", "作品审核"],
  ["help:write", "帮助资源维护"],
] as const;
export type AccessUser = User & {
  assignments: (UserRole & { role: AccessRole })[];
};
export const accessInclude = {
  assignments: { include: { role: true } },
} as const;
export function permissionsFor(user: AccessUser) {
  return [
    ...new Set(
      user.assignments
        .filter(
          (a) => a.role.active && a.role.organizationId === user.organizationId,
        )
        .flatMap((a) => a.role.permissions),
    ),
  ];
}
export function moduleFor(path: string) {
  const p = path.replace(/^\/api\/v1\//, "").split("/")[0];
  return ["materials", "material-categories"].includes(p)
    ? "assets"
    : p === "oauth"
      ? "accounts"
      : p === "help"
        ? "help"
        : p === "organization"
          ? "users"
          : p === "analytics"
            ? "analytics"
            : p === "permissions"
              ? null
              : p;
}
export const hasPermission = (permissions: string[], key: string) =>
  permissions.includes("*") || permissions.includes(key);
