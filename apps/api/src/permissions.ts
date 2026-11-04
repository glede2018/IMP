import type { AccessRole, User, UserRole } from "@prisma/client";
export const permissionCatalog = [
  ["home", "系统首页查看"],
  ["accounts", "账号查看"],
  ["accounts:write", "账号管理"],
  ["templates", "模板查看"],
  ["templates:create", "添加模板"],
  ["templates:write", "模板管理"],
  ["assets", "素材查看"],
  ["assets:write", "素材管理"],
  ["works", "作品查看"],
  ["works:write", "作品管理"],
  ["works:review", "作品审核"],
  ["tags", "标签查看"],
  ["tags:write", "标签管理"],
  ["strategy/product-selection", "选品策略查看"],
  ["strategy/social-monitor", "社媒监控查看"],
  ["strategy/topic", "营销策略查看"],
  ["analytics", "数据中心查看"],
  ["help", "帮助中心查看"],
  ["help:write", "帮助资源管理"],
  ["roles", "角色管理"],
  ["users", "用户管理"],
] as const;
const permissionGroups: Record<string, string> = {
  home: "系统首页",
  accounts: "账号",
  templates: "模板",
  assets: "素材",
  works: "作品",
  tags: "标签",
  strategy: "策略中心",
  analytics: "数据中心",
  help: "帮助中心",
  roles: "权限管理",
  users: "权限管理",
};
export const permissionGroup = (key: string) =>
  permissionGroups[key.split(":")[0].split("/")[0]] || "其他";

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
