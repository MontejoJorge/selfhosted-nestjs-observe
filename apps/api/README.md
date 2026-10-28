# api

Collector and query API for [`@nestjs/observe`](https://www.npmjs.com/package/@nestjs/observe) telemetry.

- `POST /applications/telemetry` and `POST /applications/profiles`: ingest endpoints the agent posts to
  (see [docs/protocol.md](../../docs/protocol.md)).
- `GET /api/*`: query API for the dashboard. Swagger UI at `/api/docs`, spec in [openapi.json](openapi.json).

Data lives in PostgreSQL, with day-partitioned time-series tables and retention by dropping partitions.

## Run

```sh
cp .env.example .env        # from the repo root
pnpm install
pnpm db:up                  # PostgreSQL in docker
pnpm --filter api start:dev # migrates on start, listens on :3000
```

Create a project, an application and an API key (in the dashboard, or with the API):

```sh
curl -X POST localhost:3000/api/projects -H 'content-type: application/json' -d '{"name":"Shop prod"}'
curl -X POST localhost:3000/api/projects/shop-prod/applications -H 'content-type: application/json' \
  -d '{"name":"orders-api","tags":["http"]}'
curl -X POST localhost:3000/api/projects/shop-prod/keys -H 'content-type: application/json' \
  -d '{"name":"production","applicationId":"<application id>"}'   # the secret is shown only once
```

Then point the instrumented app at the collector with that key:

```ts
ObserveModule.forRoot({
  serviceId: 'orders-api',
  endpoint: 'http://localhost:3000',
  appKey: process.env.OBSERVE_APP_KEY, // the key's keyId (obs_...)
  appSecret: process.env.OBSERVE_APP_SECRET, // the key's secret (obss_...)
});
```

Ingest without valid, active credentials is rejected with `401`.

## Deployment note: no dashboard authentication yet

The query and management API (`/api/*`, including creating API keys) has no user authentication. Do not
expose it publicly: run it on a private network or VPN, or behind a reverse proxy that authenticates users
(for example oauth2-proxy, Authelia or basic auth on your ingress). Only the ingest routes
(`POST /applications/telemetry`, `POST /applications/profiles`) need to be reachable by your services, and
they are protected by API keys.

## Scripts

| Script                 | What                                      |
| ---------------------- | ----------------------------------------- |
| `start:dev`            | watch mode                                |
| `build` / `start:prod` | compile to `dist/` and run it             |
| `db:migrate`           | build and apply pending migrations        |
| `openapi:generate`     | write `openapi.json` (no database needed) |
| `typecheck` / `lint`   | `tsc --noEmit` / oxlint                   |

Architecture and conventions: [AGENTS.md](AGENTS.md).
