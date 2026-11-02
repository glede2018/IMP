import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, value] = hash.split(":");
  if (!salt || !value || value.length !== 128) return false;
  const expected = Buffer.from(value, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const cookieName = "imp_session";
export const writeRoles = ["admin", "operator"];
export function allowedTransition(
  role: string,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  if (
    ["admin", "reviewer"].includes(role) &&
    from === "review" &&
    ["approved", "rejected"].includes(to)
  )
    return true;
  return (
    writeRoles.includes(role) &&
    ((["draft", "rejected"].includes(from) && to === "review") ||
      (from === "rejected" && to === "draft"))
  );
}
