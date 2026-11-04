FROM node:22-alpine AS base
WORKDIR /app
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG npm_config_proxy
RUN apk add --no-cache openssl

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS api-build
COPY apps/api apps/api
RUN npm run build -w @imp/api

FROM api-build AS api-production-dependencies
# 移除前端工作区及开发依赖，保留启动时必需的数据库迁移工具。
RUN npm pkg set 'workspaces[0]=apps/api' \
    && npm prune --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund \
    && node -e 'for (const name of ["react", "antd", "typescript", "tsx", "vite"]) { try { require.resolve(name); } catch { continue; } throw new Error("运行镜像不应包含 " + name); }'

FROM base AS api
ENV NODE_ENV=production
ENV PORT=3001
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY --from=api-production-dependencies /app/node_modules ./node_modules
COPY --from=api-build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=api-build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/scripts apps/api/scripts
COPY apps/api/load-env.mjs apps/api/storage-config.mjs apps/api/
EXPOSE 3001
USER node
CMD ["npm", "run", "start", "-w", "@imp/api"]

FROM dependencies AS web-build
COPY apps/web apps/web
RUN npm run build -w web

FROM nginx:1.27-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
