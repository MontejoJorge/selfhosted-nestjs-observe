# apps/api: agent guide

NestJS 12 (ESM, `nodenext`) collector and query API. It ingests `@nestjs/observe` batches into
PostgreSQL and serves the dashboard's query API. Read the root [AGENTS.md](../../AGENTS.md),
[docs/protocol.md](../../docs/protocol.md) and [docs/adr/0001-storage.md](../../docs/adr/0001-storage.md) first.

## Commands

Run from the repo root.

```sh
pnpm db:up                          # PostgreSQL via docker compose (or point DATABASE_HOST etc. elsewhere)
pnpm --filter api db:migrate        # build, then apply pending migrations
pnpm --filter api start:dev         # watch mode (also migrates on start, see DATABASE_MIGRATE_ON_START)
pnpm --filter api build | typecheck | lint
pnpm api:generate                   # regenerate apps/api/openapi.json and the web client
```

## Configuration

Validated at boot by `src/config/env.ts` (class-validator). Loaded from `apps/api/.env`, then the root `.env`;
real environment variables win. The migrate CLI (`src/database/migrate.ts`) uses the same schema.
CORS allows every origin.

| Variable                    | Default     | Notes                                        |
| --------------------------- | ----------- | -------------------------------------------- |
| `API_PORT`                  | `3000`      |                                              |
| `DATABASE_HOST`             | `localhost` |                                              |
| `DATABASE_PORT`             | `5432`      |                                              |
| `DATABASE_USER`             | `observe`   |                                              |
| `DATABASE_PASSWORD`         | `observe`   |                                              |
| `DATABASE_NAME`             | `observe`   |                                              |
| `DATABASE_POOL_MAX`         | `10`        | pg pool size                                 |
| `DATABASE_MIGRATE_ON_START` | `true`      | run pending migrations when the app boots    |
| `RETENTION_DAYS`            | `14`        | daily partitions older than this are dropped |

## Layout

```
src/
  main.ts, app.module.ts, app.setup.ts   bootstrap; global /api prefix (ingest excluded), CORS, pipes, Swagger UI
  config/env.ts                          env schema
  database/                              Kysely instance (KYSELY token), typed schema, migrations, partitions
    database.types.ts                    Database interface; keep in sync with migrations by hand
    migrations/                          one file per migration + index.ts (explicit provider)
    partition-manager.ts                 create/drop daily partitions
    batch-insert.ts                      chunked multi-row INSERT, jsonb/text sanitizing
  projects/                              management API: projects -> applications -> API keys
    domain/                              slugs, key generation, secret hashing, key status
    projects|applications|api-keys/      controller, DTOs, service, port + Postgres adapter
    api-keys/api-key-authenticator.ts    ingest credentials -> application id (60 s cache)
    activity.ts                          request buckets for the project and application cards
  ingest/                                write side (hexagonal)
    domain/                              pure TS: wire types (wire.ts), wire -> domain mapping, span flattening,
                                         fingerprints, UUIDv7
    application/                         use cases + output ports (TelemetryWriter, ProfileWriter)
    infrastructure/                      Postgres adapters of the ports
    http/                                controller (/applications/*), auth guard, light payload validation
  telemetry/                             read side: one module per feature
    <feature>/<feature>.repository.ts    read port (abstract class, used as the DI token)
    <feature>/postgres-<feature>.repository.ts   Kysely adapter
    <feature>/<feature>.dto.ts           query + response DTO classes (OpenAPI)
    <feature>/<feature>.controller.ts
    common/                              time windows, buckets, keyset cursors, scope, SQL fragments, shared DTOs
  maintenance/                           hourly cron: partitions ahead, retention, purge of deleted applications
  health/                                GET /api/health
  openapi/                               document builder + generate.ts (writes apps/api/openapi.json)
```

Ports are abstract classes so they double as Nest injection tokens. A ClickHouse backend would add
adapters for `TelemetryWriter` and the read repositories, leaving domain, use cases and controllers alone.
The read side deliberately has no use-case layer: controllers call the read port directly (CQRS-style read models).

## Data model

Day-partitioned (range on the time column, UTC days, partitions named `<table>_pYYYYMMDD`):
`requests`, `jobs`, `spans`, `error_occurrences`, `logs`, `runtime_metrics`, `custom_metrics`.
Plain tables: `services`, `error_groups`, `error_group_culprits`, `objectives`, `profiles`, and the
management tables `projects`, `applications`, `api_keys`, `application_purges`.

- **Projects -> applications -> API keys.** A project has a unique, immutable `slug`; an application has a
  name unique in its project and up to 3 tags; an API key belongs to one application. Secrets are 32
  random bytes, stored as SHA-256 only and returned once at creation. Key status (active, expired,
  revoked) is derived from `expires_at` / `revoked_at`.
- Every telemetry row carries `application_id` (from the API key that sent it). `service_id` stays as an
  attribute: the agent's serviceId, exposed as the optional `instance` filter.
- Telemetry has no foreign key to `applications` (cascades into partitions would be row by row). Deleting
  a project or application inserts its ids into `application_purges` in the same transaction;
  `ApplicationPurger` then deletes the rows table by table and partition by partition (right away in the
  background, and on every maintenance run until done). Queries only see applications of live projects.

- Execution and log ids are **UUIDv7 stamped with the event time**, so a lookup by id also filters on the
  partition key (`windowFromId`) and touches one partition.
- Each execution keeps its original span tree as `jsonb` (`trace`), so detail views need one read. `spans` holds
  the flattened tree (depth-first `position`, `parent_position`, `parent_span_id`, `depth`) for future analytics.
- Error fingerprint = sha1(source, class, normalized message, top stack frame without line/column), per
  application. `error_groups.service_id` is the instance of the most recent occurrence.
  `error_groups.count` is all-time; `error_group_culprits` counts per operationId or `queue/name`.
- Events older than `RETENTION_DAYS` or more than 1 day in the future are dropped at ingest.

## Migrations

Kysely `Migrator` with an explicit provider (`src/database/migrations/index.ts`). FileMigrationProvider is
avoided because ESM dynamic imports of Windows paths break and the explicit list ships with the build.

To add one: create `src/database/migrations/000N-name.ts` exporting `{ up, down }`, register it in `index.ts`,
update `database.types.ts`. Use raw `sql` for anything partition-related. Indexes declared on a partitioned
parent propagate to every partition. Never edit an applied migration.

Partitions are not created by migrations: `PartitionManager` creates yesterday through +3 days on boot and
hourly, and on demand for any day an ingest batch touches (advisory-locked). Retention detaches partitions
`CONCURRENTLY` and drops them.

## Query conventions (performance rules)

- Every telemetry query is scoped: `ScopeResolver` turns `project` (id or slug) and the optional
  `application` into application ids (404 when the application is not in the project), and queries filter
  with `inApplications()` (`=` for one id, `in (...)` for several).
- Every query on a partitioned table filters its partition key with a half-open `[from, to)` window.
  Ranges are `1h`, `24h` and `7d` (buckets of 1 min, 15 min and 3 h).
- Lists use keyset pagination on `(time desc, id desc)` with `limit + 1` rows. Never OFFSET. Cursors are
  opaque base64url `[iso, id]`, validated before use.
- Indexes lead with `application_id` (equality) then the time column (range):
  `(application_id, called_at desc, id desc)`, `(application_id, operation_id, ...)`,
  `(application_id, queue, name, ...)`, `(application_id, sampled_at desc)`, ... The plain
  `(time desc, id desc)` indexes serve keyset lists across several applications of a project, and
  `trace_id` the trace lookups. `spans` is only BRIN-indexed (nothing reads it yet).
- Management lists use keyset pagination too: projects by `(name, id)`, applications by `name` (unique
  per project), API keys by `(created_at desc, id desc)`. Card stats are computed for the whole page in
  one aggregate (`activity.ts`) plus one lateral per row for the latest runtime sample.
- Percentiles use one `percentile_cont(array[...])` per group, only over a pruned window.
- Timeline buckets use `date_bin` with a literal width from `bucketSeconds` (~100 buckets max). TimeBucket
  series are gap-filled in TS.
- Select explicit columns, never `*`. Compose related data in one query (lateral join for top culprit) or
  parallel queries (`Promise.all`), never per row.
- Ingest writes the batch in one transaction: append-only inserts first, then upserts on hot rows
  (objectives, error groups, culprits, services) deduplicated and sorted by key to avoid deadlocks.
  `insertMany` chunks rows to stay under the 65535 bind-parameter limit.
- `int8`/`numeric` are parsed to JS numbers (`create-database.ts`).

## OpenAPI

The dashboard's client is generated from `apps/api/openapi.json`, which is committed as the contract.

- Response and query shapes are DTO **classes** in `*.dto.ts` files (the Swagger CLI plugin only scans those).
  They are the single source of truth: services and repositories use them as types too.
- String unions use `@ApiProperty({ enum, enumName })` so the generator emits named enums. Nullable fields need
  an explicit `@ApiProperty({ type, nullable: true })`.
- Every route has `@ApiTags`, a stable `@ApiOperation({ operationId })` (generated method names come from it)
  and `@ApiOkResponse({ type })`. Pages are concrete classes (`RequestPageDto`, ...).
- Ingest routes are hidden with `@ApiExcludeController()`.
- `pnpm --filter api openapi:generate` builds and runs `src/openapi/generate.ts`, which creates the app in
  **preview mode** (no providers instantiated, no DB). Keep it that way: no I/O in constructors.
- **Whenever a controller, DTO or route changes, run `pnpm api:generate` and commit `apps/api/openapi.json`
  with the change**, then tell the frontend what changed.

## Conventions

- ESM: relative imports end in `.js`. Use `import type` for type-only imports.
- No tests (maintainer's decision). Verify with build/typecheck/lint and by running the app.
- Wire-format changes: edit `src/ingest/domain/wire.ts` and `docs/protocol.md` together.
