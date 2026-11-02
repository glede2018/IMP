FROM node:22-alpine AS dependencies
WORKDIR /app
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG npm_config_proxy
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build -w @imp/api

FROM dependencies AS api
ENV NODE_ENV=production
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
