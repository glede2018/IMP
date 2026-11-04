import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

// 仅维护根目录配置，已存在的配置不覆盖。
const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.log("根目录 .env 已存在，保留原配置。");
} else {
  const password = randomBytes(18).toString("base64url");
  const key = randomBytes(32).toString("base64");
  const template = readFileSync(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  writeFileSync(
    target,
    template
      .replace("ChangeThisLocalPassword123!", password)
      .replace(
        "OAUTH_TOKEN_ENCRYPTION_KEY=",
        `OAUTH_TOKEN_ENCRYPTION_KEY=${key}`,
      ),
    { mode: 0o600 },
  );
  console.log("已创建根目录 .env，管理员密码保存在 BOOTSTRAP_PASSWORD。");
}
