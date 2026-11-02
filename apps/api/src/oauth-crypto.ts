import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function tokenKey(
  value = process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("OAuth encryption key must be 32 bytes encoded as base64");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Invalid OAuth encryption key");
  return key;
}
export function encryptToken(token: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptToken(value: string, context: string): string {
  const [version, nonce, tag, encrypted, ...extra] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !encrypted || extra.length)
    throw new Error("Invalid OAuth ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenKey(),
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
