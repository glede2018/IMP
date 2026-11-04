import { isIP } from "node:net";

// 只信任明确指定的代理地址或网段，禁止无条件信任外部请求头。
export function trustedProxyRanges(env = process.env): string[] | false {
  const value = env.TRUSTED_PROXY_CIDRS ?? "loopback";
  if (!value.trim() || value === "false") return false;
  const ranges = value.split(",").map((item) => item.trim());
  for (const range of ranges) {
    if (["loopback", "linklocal", "uniquelocal"].includes(range)) continue;
    const [address, prefix, extra] = range.split("/");
    const family = isIP(address);
    if (
      !family ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error(
        "TRUSTED_PROXY_CIDRS 必须是可信代理地址或网段，不能信任整个公网",
      );
    }
  }
  return ranges;
}
