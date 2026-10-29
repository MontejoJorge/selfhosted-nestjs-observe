# syntax=docker/dockerfile:1
# Dashboard SPA served by nginx, which also proxies /api/ (and the ingest routes) to the API.
# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t selfhosted-nestjs-observe-web .

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.29-alpine

FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY apps/web ./apps/web
COPY apps/api/package.json apps/api/openapi.json ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter web
# Empty: the client calls its own origin, and nginx forwards /api/ to API_UPSTREAM at runtime.
ENV VITE_API_URL=
RUN pnpm --filter web build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime
# host:port of the API, rendered into the nginx config when the container starts.
ENV API_UPSTREAM=api:3000
# Lets the entrypoint export NGINX_LOCAL_RESOLVERS (from /etc/resolv.conf) for the template.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# 8080: dashboard + /api/. 8081: ingest routes only.
EXPOSE 8080 8081
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
