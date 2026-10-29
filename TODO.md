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

## Where the time goes

A map of the services, repositories, classes and outbound calls that take the most time, like the
hosted dashboard's view. This is what the `spans` table is for: one row per span, with `class_name`,
`method_name`, `origin` (controller, provider, database, outgoing HTTP...), `duration_ms`, `depth` and the
parent link, while `requests.trace` / `jobs.trace` keep the tree for detail views.

- API: `GET /time-breakdown?from&to&operation?` aggregating `spans` in the window by class and method
  (and by `origin`): total and self time (duration minus children), share of the total, calls, p95.
  Self time needs the children's durations, via `parent_position` within the same execution.
- Index `spans` for it, e.g. `(application_id, called_at)` plus what the grouping needs; check the plan on
  a busy day first, it is the biggest table.
- Web: a treemap or ranked bars grouped by origin and class, filterable by operation; clicking a class
  lists its slowest spans with links to their traces.
- If this view is dropped, stop writing `spans` and drop the table: it is the most expensive one to write.

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
