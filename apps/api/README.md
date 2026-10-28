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

Point an instrumented app at it:

```ts
ObserveModule.forRoot({
  serviceId: 'orders-api',
  endpoint: 'http://localhost:3000',
});
```

Set `INGEST_API_KEY` / `INGEST_API_SECRET` (and the agent's `appKey` / `appSecret`) to require credentials.

## Scripts

| Script                 | What                                      |
| ---------------------- | ----------------------------------------- |
| `start:dev`            | watch mode                                |
| `build` / `start:prod` | compile to `dist/` and run it             |
| `db:migrate`           | build and apply pending migrations        |
| `openapi:generate`     | write `openapi.json` (no database needed) |
| `typecheck` / `lint`   | `tsc --noEmit` / oxlint                   |

Architecture and conventions: [AGENTS.md](AGENTS.md).
