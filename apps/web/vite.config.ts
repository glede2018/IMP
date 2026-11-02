import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // 路径别名，方便业务模块引用
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 开发服务器端口
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY || "http://localhost:3001", changeOrigin: false },
    },
  },
  build: {
    // 生产构建输出目录（iga-pages 默认使用项目根目录或 dist）
    outDir: 'dist',
  },
})
