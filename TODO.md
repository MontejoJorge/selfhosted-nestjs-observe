# TODO

Not scheduled.

## Users: filters on errors and traces

`GET /users`, `GET /users/:userId` and the `userId` filter on requests exist (ADR 0004). Not done: a
`userId` filter on error groups and traces. `error_occurrences` has no user, so it needs either a
`user_id` column written at ingest (and an index) or a join through `requests` per occurrence.

## Users in the example app

The seeded data has user ids, but the example app does not send any, so new traffic is anonymous.

- Set `http.getUserId` in the example's `ObserveModule` from an `x-user-id` request header.
- Have the load generator send `x-user-id` from a fixed pool of ~50 user ids, skewed (a few heavy
  users), plus some requests without a user. Leave `load.config.ts` values alone.

## Compatibility tests against `@nestjs/observe` versions

The wire protocol is reverse-engineered (`docs/protocol.md`), so a new agent release can break ingest
without notice.

- A script or CI job that installs a given `@nestjs/observe` version (`latest` by default) in the example
  app, starts the collector and the example against a throwaway PostgreSQL, drives traffic and a job run,
  and checks that ingest answers `200` and that requests, jobs, errors, logs, traces and runtime metrics
  show up in the query API.
- Diff the agent's contract (`TELEMETRY_BATCH` / `validateTelemetryPayload` in its `dist/`) against
  `apps/api/src/ingest/domain/wire.ts` to flag new or renamed fields.
- Run it on a schedule against `latest` and record which versions are known to work in the README.
- Needs the maintainer's go-ahead: the repo has no tests yet.

## Storage usage and trimming old data

See how much each project and application takes in the database, and free space without losing recent
data: with 14 days stored, "delete 7 days" removes the **oldest** 7 (days 8 to 14 ago) and keeps the
last 7.

- Size per application: tables are shared and partitioned by day, not by application, so PostgreSQL has
  no per-application size. Either count it at ingest (rows and payload bytes per application per day in
  a small `application_usage` table, cheap and exact enough), or estimate it with `pg_column_size` over a
  sample. Show the total per project, the split by table (requests, spans, logs...) and the daily trend.
- Whole database: `pg_total_relation_size` per table and per day partition, for an overview of what the
  retention keeps.
- Trim: "delete data older than N days" for a project or application (N below the global retention).
  Run it in the background like `ApplicationPurger`: per table and per partition, in batches, only on the
  partitions older than the cut-off.
- For everything at once, lowering `RETENTION_DAYS` already drops whole partitions, which frees disk right
  away. Row deletes only free space for reuse until autovacuum (or `VACUUM FULL`/`pg_repack`) runs; say so
  in the UI.
- Maybe a retention per project or application (override of `RETENTION_DAYS`) applied by the maintenance
  job, so trimming does not have to be manual.

## Free the disk of deleted applications

`ApplicationPurger` deletes a deleted application's rows with `DELETE`, which only leaves dead tuples:
after deleting the seeded demo project (2026-10-30) the database stayed at 31 GB (`spans` 21 GB with
~59 M dead rows, `requests` 9.6 GB) until a manual `VACUUM`. Decide what to do so the space comes back
on its own. Options to weigh:

- `TRUNCATE` (or detach and drop) a partition when the purged application is the only one in it, and
  only `DELETE` from partitions shared with other applications.
- Run `VACUUM` on the partitions the purge touched once it finishes (outside a transaction, one
  partition at a time). Plain `VACUUM` gives the trailing empty pages back to the OS and keeps the rest
  for reuse. `VACUUM FULL` frees everything but locks the partition, so it does not fit a live collector.
- Partition (or sub-partition) by application as well as by day, so deleting an application is a
  `DROP` like retention. Costs many more partitions.
- Do nothing beyond saying in the UI that the space is reused by new telemetry and comes back at the
  latest when the partitions age out of `RETENTION_DAYS`.

## Custom metrics

`custom_metrics` holds every counter, gauge and summary the agents send (with tags and p50/p95/p99).

- API: `GET /metrics/custom` (names with type and description) and `GET /metrics/custom/:name/series`
  bucketed over time. Aggregate by type: sum counters, average or take the last gauge value per `kind`,
  use the quantiles for summaries.
- Add an `(application_id, name, recorded_at)` index; the current one has no `name`.
- Web: a "Metrics" page with the list and one chart per metric, filterable by instance and tags.

## Profiles (flame graphs)

`profiles` stores the raw windows (folded stacks labelled by span) as `jsonb`.

- Aggregate at ingest into something like `profile_stacks (application_id, minute, stack_hash, frames,
samples)` instead of folding stacks on every query.
- API: `GET /profiles/flamegraph?from&to&instance` returning a frame tree with sample counts.
- Partition `profiles` by day like the other telemetry tables, so retention drops partitions instead of
  deleting rows.
- Web: a flame graph on the Profiler page, ideally linked per span from a request's detail.

## Drop `spans`?

Services and the dashboard treemap read `span_stats_5m` (ADR 0004), so no view
reads `spans`. It is the most expensive table to write and store (~8 M rows and ~2.5 GB a day on the
seed). Drop it, or stop writing it, unless a new view needs individual spans across executions (the
detail views use `requests.trace` / `jobs.trace`).

## Versions and releases

Every request, job and instance already carries `service_version` (`OBSERVE_SERVICE_VERSION`, the
commit the platform exposes, or `serviceVersion`).

- API: `GET /releases` listing each version per application with first and last seen, instances running
  it, and request count, error rate and p95 since it appeared.
- Mark deploys on the request/job charts (a vertical line where the version changes) and compare a release
  with the previous one: new error groups, error rate and latency before and after.
- Web: a "Releases" page, and the version shown on the instance list and in request details.
- Record version changes per instance in `services` (or a small `service_versions` table), so "when did
  this instance switch" does not need a scan of `requests`.
