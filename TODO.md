# TODO

Not scheduled.

## Users

The agent reports a user id per request (`http.getUserId` in `ObserveModule`, wire field `u`), and it is
already stored in `requests.user_id` and returned as `userId` by the requests API.

- API: `GET /users` (users seen in the range with request count, error rate, p95 and last seen) and a
  `userId` filter on requests, errors and traces. Add an index on `(application_id, user_id, called_at)`.
- Web: a "Users" menu entry with that list; a user's page shows their requests and traces, so a
  complaint from one user can be traced back. Link the user id from the request detail.
- Example app: set `http.getUserId` (e.g. from an `x-user-id` header the load generator sends).

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

## `spans` table

Duplicates the span tree already stored in `requests.trace` / `jobs.trace` and is the most expensive
table to write (one row per span).

- Either use it: a "Spans / Dependencies" view with time per `class_name.method_name` or `origin`
  (database, outgoing HTTP...), p95 and the slowest spans.
- Or stop writing it and drop it, if no such view is planned.
