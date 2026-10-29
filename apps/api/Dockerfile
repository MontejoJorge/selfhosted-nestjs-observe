# syntax=docker/dockerfile:1
# Collector + query API. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t selfhosted-nestjs-observe-api .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Fetch every dependency from the lockfile first, so this layer is cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter api
RUN pnpm --filter api build
# Production dependencies only, plus the compiled output.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /out \
 && rm -rf /out/dist /out/src \
 && cp -r apps/api/dist /out/dist

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV API_PORT=3000
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
