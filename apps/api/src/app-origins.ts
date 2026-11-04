import type { Request } from "express";

// 使用显式来源白名单，不根据客户端可伪造的 Host 或转发头放宽来源校验。
export function appOrigins(env = process.env): string[] {
  const values = [env.APP_ORIGIN, ...(env.APP_ALLOWED_ORIGINS || "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  return [
    ...new Set(
      values.map((value) => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw new Error("应用来源必须是完整的 HTTP 或 HTTPS 地址");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error("应用来源只能包含协议、域名和端口");
        return url.origin;
      }),
    ),
  ];
}

export function validRequestOrigin(req: Pick<Request, "get">) {
  const origin = req.get("Origin");
  return (
    req.get("X-IMP-Request") === "1" &&
    typeof origin === "string" &&
    appOrigins().includes(origin)
  );
}
