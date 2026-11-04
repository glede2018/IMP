import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envDir = fileURLToPath(new URL("../../", import.meta.url));
const webDir = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig(({ mode }) => {
  // 前后端统一读取根目录配置，仅允许 VITE_ 前缀变量提供给浏览器。
  const env = loadEnv(mode, envDir, "VITE_");
  return {
    envDir,
    envPrefix: "VITE_",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // 路径别名，方便业务模块引用。
        "@": path.resolve(webDir, "./src"),
      },
    },
    server: {
      // 本地开发服务器端口。
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY || "http://localhost:3001",
          changeOrigin: false,
        },
      },
    },
    build: {
      // 生产构建输出目录。
      outDir: "dist",
    },
  };
});
