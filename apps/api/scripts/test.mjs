import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// 自动发现测试文件，新增业务测试无需手工追加到 CI 命令。
const mode = process.argv[2] || "unit";
if (!["unit", "integration"].includes(mode))
  throw new Error("测试类型必须是 unit 或 integration");
const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(new URL("../test/", import.meta.url))
  .filter(
    (name) =>
      name.endsWith(".test.ts") &&
      name.endsWith(".integration.test.ts") === (mode === "integration"),
  )
  .sort()
  .map((name) => `test/${name}`);
if (!files.length) throw new Error("未发现对应测试文件");
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root,
  // 测试默认隔离真实采集配置，专用用例自行注入模拟密钥。
  env: { ...process.env, DOUYIN_DATA_PROVIDER: "official", ONEAPI_API_KEY: "" },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("测试进程启动失败");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
