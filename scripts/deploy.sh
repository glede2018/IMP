#!/usr/bin/env bash
set -euo pipefail

# 从项目根目录部署，兼容 Compose 插件和独立命令。
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo '缺少根目录 .env，请先按 .env.example 配置生产环境。' >&2
  exit 1
fi
if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo '未找到 Docker Compose，请先安装 Compose 插件或 docker-compose。' >&2
  exit 1
fi

# 服务器仅使用主配置；先构建成功，再替换正在运行的服务。
"${compose[@]}" -f docker-compose.yml config --quiet
"${compose[@]}" -f docker-compose.yml build api web
"${compose[@]}" -f docker-compose.yml up -d --force-recreate api web
"${compose[@]}" -f docker-compose.yml ps
if ! curl --fail --silent --show-error --connect-timeout 3 --max-time 10 --retry 10 --retry-delay 2 --retry-connrefused http://127.0.0.1:8080/api/v1/health; then
  echo '健康检查失败，请查看 API 日志。' >&2
  "${compose[@]}" -f docker-compose.yml logs --tail=100 api
  exit 1
fi
printf '\n部署完成，请使用网站域名检查页面。\n'
