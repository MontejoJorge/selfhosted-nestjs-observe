# syntax=docker/dockerfile:1

# One image for the whole app: the NestJS API, which also serves the built dashboard.
#   docker build -t selfhosted-nestjs-observe .

ARG NODE_VERSION=24

# ---- base: Node + pnpm ---------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ---- build: install, compile api + web, keep only what runs -------------------------
FROM base AS build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile

# An empty API URL makes the dashboard call the origin it is served from.
RUN pnpm --filter api build \
 && VITE_API_URL= pnpm --filter web build

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /out \
 && rm -rf /out/src /out/dist \
 && cp -r apps/api/dist /out/dist \
 && cp -r apps/web/dist /out/public

# ---- runtime ----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    API_PORT=3000 \
    DASHBOARD_DIR=/app/public
WORKDIR /app

COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.API_PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
