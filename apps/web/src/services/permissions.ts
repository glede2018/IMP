import type { UserInfo } from "@/types";
export function menuKey(path: string) {
  if (path === "/material-categories") return "assets";
  if (path === "/") return "home";
  if (path.startsWith("/permissions/")) return path.split("/")[2];
  if (path === "/organization") return "users";
  if (path === "/video-editor") return "works";
  if (path === "/settings") return null;
  return path.replace(/^\//, "");
}
export function canAccess(user: UserInfo | null, path: string) {
  const key = menuKey(path);
  return (
    !!user &&
    (!key || user.permissions.includes("*") || user.permissions.includes(key))
  );
}
