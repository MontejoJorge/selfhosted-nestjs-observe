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
| `AGGREGATE_RETENTION_DAYS`  | `90`        | same for the rollups (min: RETENTION_DAYS)   |

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
    cleanup.ts                           batched DELETE by ctid, VACUUM of one table or partition
  projects/                              management API: projects -> applications -> API keys
    domain/                              slugs, key generation, secret hashing, key status
    projects|applications|api-keys/      controller, DTOs, service, port + Postgres adapter
    api-keys/api-key-authenticator.ts    ingest credentials -> application id (60 s cache)
    activity.ts                          request buckets for the project and application cards
                                         (projects also hold their 3 header range presets, `range_presets`)
  ingest/                                write side (hexagonal)
    domain/                              pure TS: wire types (wire.ts), wire -> domain mapping, span flattening,
                                         fingerprints, UUIDv7
    application/                         use cases + output ports (TelemetryWriter, ProfileWriter)
    infrastructure/                      Postgres adapters of the ports; usage-tally.ts counts rows/bytes
                                         per day and raw table for application_usage
    http/                                controller (/applications/*), auth guard, light payload validation
  telemetry/                             read side: one module per feature
    <feature>/<feature>.repository.ts    read port (abstract class, used as the DI token)
    <feature>/postgres-<feature>.repository.ts   Kysely adapter
    <feature>/<feature>.dto.ts           query + response DTO classes (OpenAPI)
    <feature>/<feature>.controller.ts
    common/                              time windows, buckets, keyset cursors, scope, SQL fragments, shared DTOs
    releases/release-comparison.ts       release windows and verdict thresholds (pure, ADR 0006)
    data-days/                           GET /projects/:project/data-days: UTC days with telemetry (ADR 0007)
  storage/                               /api/storage and /api/projects/:project/storage (ADR 0005)
    domain/                              apportioning of partition sizes, trim cutoff rule
    storage.service.ts                   assembles the views, validates and queues trims
    storage.repository.ts                read port (catalog sizes, usage) + trim queue port
  maintenance/                           hourly cron: partitions ahead, retention, purge of deleted applications,
                                         storage trims (StorageTrimmer)
  health/                                GET /api/health
  openapi/                               document builder + generate.ts (writes apps/api/openapi.json)
```

Ports are abstract classes so they double as Nest injection tokens. A ClickHouse backend would add
adapters for `TelemetryWriter` and the read repositories, leaving domain, use cases and controllers alone.
The read side deliberately has no use-case layer: controllers call the read port directly (CQRS-style read models).

## Data model

Day-partitioned (range on the time column, UTC days, partitions named `<table>_pYYYYMMDD`):
`requests`, `jobs`, `error_occurrences`, `logs`, `runtime_metrics`, `custom_metrics`, and the
rollups `requests_1m`, `jobs_1m`, `users_1h`, `user_presence_15m` and `span_stats_5m`.
Plain tables: `services`, `service_versions`, `error_groups`, `error_group_culprits`, `profiles`, `application_usage`, and
the management tables `projects`, `applications`, `api_keys`, `application_purges`, `storage_trims`.

- **Projects -> applications -> API keys.** A project has a unique, immutable `slug`; an application has a
  name unique in its project and up to 3 tags; an API key belongs to one application. Secrets are 32
  random bytes, stored as SHA-256 only and returned once at creation. Creating an application also creates
  its first key (active, named `<name> agent`) in the same transaction and returns it with the secret. Keys do not expire: a key is
  active until it is revoked (`revoked_at`) or deleted.
- Every telemetry row carries `application_id` (from the API key that sent it). `service_id` stays as an
  attribute: the agent's serviceId, exposed as the optional `instance` filter.
- Telemetry has no foreign key to `applications` (cascades into partitions would be row by row). Deleting
  a project or application inserts its ids into `application_purges` in the same transaction;
  `ApplicationPurger` then deletes the rows table by table and partition by partition, in batches,
  and runs a plain `VACUUM` on each one it deleted from (right away in the background, and on every
  maintenance run until done). Queries only see applications of live projects.

- Execution and log ids are **UUIDv7 stamped with the event time**, so a lookup by id also filters on the
  partition key (`windowFromId`) and touches one partition.
- Each execution keeps its original span tree as `jsonb` (`trace`), so detail views need one read. Spans
  are not stored one by one: ingest flattens the tree in memory (`flattenTrace`) only to roll it up into
  `span_stats_5m` (the `spans` table was dropped by migration 0009, see ADR 0004).
- **Per-minute rollups** ([ADR 0003](../../docs/adr/0003-minute-rollups.md)): `requests_1m` and `jobs_1m`
  hold counts, duration sum/min/max and a log-scale latency histogram (`int4[]`,
  `ingest/domain/latency-histogram.ts`) per application, minute, instance and operation or job. Ingest
  upserts them in the batch's transaction (`histogram_add` merges histograms); they are kept for
  `AGGREGATE_RETENTION_DAYS`. `method` is `''` when the request has none (it is in the primary key).
- **Users and services rollups** ([ADR 0004](../../docs/adr/0004-users-and-time-breakdown.md)):
  `users_1h` per application, UTC hour and user id (no instance; `''` for requests without a user id,
  returned as `userId: null`; ids are truncated to 255 characters at ingest); `user_presence_15m`
  (application, 15-minute bucket, identified user; no payload) for distinct users per bucket; `span_stats_5m` per application, 5-minute bucket, instance,
  source, operation (operationId or `queue/name`), origin, class and method, with total and self time
  (duration minus direct children, at least 0, computed by the trace flattener) and the slowest span
  of the row (`max_execution_id`, `max_trace_id`, `max_called_at`, `max_self_ms`). The user tables
  were backfilled; `span_stats_5m` only covers spans ingested after migration 0007.
- **Releases** ([ADR 0006](../../docs/adr/0006-releases.md)): `service_versions` holds one row per
  application, instance and version with its first and last sighting (the batch's execution time span,
  or receive time without executions), upserted at ingest after `services`; null versions are skipped.
  A release is (application, version); its boundary is the earliest `first_seen_at` across instances
  (a redeploy of an old version keeps it). Comparisons read `requests_1m`/`jobs_1m` before and after
  the boundary minute; rows not seen for `AGGREGATE_RETENTION_DAYS` are pruned.
- **Storage usage** ([ADR 0005](../../docs/adr/0005-storage-usage-and-trims.md)): `application_usage`
  holds rows and estimated payload bytes per application, UTC day and raw table (`USAGE_TABLES`),
  upserted as the last statement of each ingest transaction (and by the profile writer), backfilled by
  migration 0010. Sizes per application are estimates: each day partition's `pg_total_relation_size`
  split by the counted bytes. Retention, the purger and trims delete the matching usage rows.
- **Trims** (`storage_trims`): "keep the last N days" (`1 <= N < RETENTION_DAYS`, cutoff day
  `today - N`) for a project or one application, one queued row per target. `StorageTrimmer` deletes the
  rows of the raw tables before the cutoff partition by partition in batches, `VACUUM`s each partition
  it deleted from and saves its progress; rollups and error groups are not trimmed.
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
  Ranges ([ADR 0007](../../docs/adr/0007-time-ranges.md)) are `1h`, `3h`, `6h`, `12h`, `24h`, `3d`, `7d`
  and `15d` (buckets of 1 min, 5 min, 5 min, 15 min, 15 min, 1 h, 3 h and 6 h). Every route that takes
  `range` also takes a custom `from`/`to` (zoned ISO date-times, `from < to`, at most `MAX_WINDOW_DAYS`
  = 31 days apart, else 400), validated in one place (`RangeQueryDto`, `resolveWindow`).
- Lists use keyset pagination on `(time desc, id desc)` with `limit + 1` rows. Never OFFSET. Cursors are
  opaque base64url `[iso, id]`, validated before use.
- Indexes lead with `application_id` (equality) then the time column (range):
  `(application_id, called_at desc, id desc)`, `(application_id, operation_id, ...)`,
  `(application_id, queue, name, ...)`, `(application_id, user_id, called_at desc, id desc)` (partial,
  `user_id is not null`), `(application_id, sampled_at desc)`, ... The plain
  `(time desc, id desc)` indexes serve keyset lists across several applications of a project, and
  `trace_id` the trace lookups.
- Management lists use keyset pagination too: projects by `(name, id)`, applications by `name` (unique
  per project), API keys by `(created_at desc, id desc)`. Card stats are computed for the whole page in
  one aggregate (`activity.ts`) plus one lateral per row for the latest runtime sample.
- **Stats and timelines read the rollups, never the raw rows**: overview, operations, queues, users,
  services and the project/application cards (`telemetry/common/rollups.ts`). One grouped query
  for sums/min/max, one that unnests the histograms into `(bucket, count)` cells per group; percentiles
  are computed in TS. When there are many groups and a limit (users), fetch the cells of the returned
  groups only. Raw tables serve lists, details and traces. `percentile_cont` is only left for error
  group timelines.
- `users_1h` reads are exact for any window: whole hours from the rollup, the partial hours at both
  ends from `requests` (`histogramBucketOf` buckets raw durations in SQL). A user's timeline with
  buckets under 1 h reads their raw requests through the user index. Distinct users per timeline
  bucket read the grain that divides the bucket (`users_1h`, `user_presence_15m`, or raw for 1- and 5-minute
  buckets) and group by `(bucket, user)` before counting (never `count(distinct)` on large inputs).
  The users routes reject
  `instance` (400). Services (`span_stats_5m`) starts at the 5-minute bucket containing `from`, leaves out
  outbound calls (lowercase class names such as `http`, `pg`), and its slowest spans are the `max_*`
  columns of the rollup rows.
- Timeline buckets use `date_bin` with a literal width from `bucketSeconds` (~100 buckets max). TimeBucket
  series are gap-filled in TS.
- Select explicit columns, never `*`. Compose related data in one query (lateral join for top culprit) or
  parallel queries (`Promise.all`), never per row.
- Ingest writes the batch in one transaction: append-only inserts first, then upserts on hot rows
  (error groups, culprits, services, `service_versions`, and `application_usage` as the very last statement) deduplicated
  and sorted by key to avoid deadlocks.
  `insertMany` chunks rows to stay under the 65535 bind-parameter limit.
- Releases: the scope's releases are one aggregate over `service_versions` (primary key) with `lag()`
  for the previous version. Comparisons of a whole page run in two queries per rollup: a `values`
  list of (release, side, application, from, to) joined on `(application_id, minute)` inside the
  overall window (pruning), one for sums and one for histogram cells; per-operation impact fetches
  the cells of the top 10 groups only. Markers have their own path (`/release-markers`) so no
  version string shadows them.
- Days with data (`data-days`) read `application_usage` through its primary key, then probe
  `requests_1m`/`jobs_1m` with one `exists` per remaining day (run-time pruning, one partition each).
- Storage views read the catalog (`pg_total_relation_size`, `reltuples`, `pg_partition_tree`) and
  `application_usage` (through its primary key for one project), never the telemetry rows.
- Bulk deletes (purge, trim) go through `deleteInBatches` (10 000 rows per statement by `ctid`, one
  partition at a time, over an index leading with `application_id`), then `vacuumTable` (plain
  `VACUUM`, outside a transaction, errors logged). Never `VACUUM FULL` on a live collector.
- `int8`/`numeric` are parsed to JS numbers and `date` stays a `YYYY-MM-DD` string (`create-database.ts`).

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
