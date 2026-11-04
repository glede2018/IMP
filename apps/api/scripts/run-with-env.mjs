import "../load-env.mjs";
import { spawn } from "node:child_process";

// 为 Prisma 等命令行工具注入根目录配置，避免依赖当前工作目录。
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("请指定需要运行的命令");
const child = spawn(command, args, { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.on("error", () => {
  console.error("命令启动失败，请检查依赖是否已安装");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
