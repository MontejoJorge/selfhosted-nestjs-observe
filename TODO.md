# TODO

Not scheduled.

## Users: filters on errors and traces

`GET /users`, `GET /users/:userId` and the `userId` filter on requests exist (ADR 0004). Not done: a
`userId` filter on error groups and traces. `error_occurrences` has no user, so it needs either a
`user_id` column written at ingest (and an index) or a join through `requests` per occurrence.

## Storage usage and trimming old data

Usage counters, the storage API and trims are done (ADR 0005: `GET /api/storage`,
`GET /api/projects/:project/storage`, `POST|GET /api/projects/:project/storage/trims`). Remaining:

- A retention per project or application (override of `RETENTION_DAYS`) applied by the maintenance
  job, so trimming does not have to be manual. It could queue `storage_trims` rows itself.

## Free the disk of deleted applications

`ApplicationPurger` deletes a deleted application's rows with `DELETE`, which only leaves dead tuples:
after deleting the seeded demo project (2026-10-30) the database stayed at 31 GB (`spans` 21 GB with
~59 M dead rows, `requests` 9.6 GB) until a manual `VACUUM`.

Done: `spans` is gone (migration 0009), and the purger and storage trims delete in batches and run a
plain `VACUUM` on every partition they deleted from (one at a time, outside a transaction, errors
logged). That makes the space reusable at once and returns the heap's trailing empty pages, but never
index space, and the heap only when `VACUUM` gets its brief exclusive lock (it skips the truncation
otherwise): after the demo purge and a manual `VACUUM`, `requests_p20261028` has no live rows and still
takes 432 MB of heap and 315 MB of indexes, while the `logs` partitions went down to their indexes
(5.4 GB database for ~11 k live rows). Remaining options:

- `TRUNCATE` (or detach and drop) a partition when the purged or trimmed applications are the only ones
  in it (no rows left from others: `application_usage` tells which), and only `DELETE` from partitions
  shared with other applications. `TRUNCATE` takes an `ACCESS EXCLUSIVE` lock, short on an old partition.
- `REINDEX CONCURRENTLY` the indexes of partitions that lost most of their rows, to give the index
  space back.
- Partition (or sub-partition) by application as well as by day, so deleting an application is a
  `DROP` like retention. Costs many more partitions.
- In the UI, say that the space is reused by new telemetry and comes back fully at the latest when the
  partitions age out of `RETENTION_DAYS`.

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

## Versions and releases

The API side is done (ADR 0006): `service_versions` history per instance, `GET /api/releases`,
`GET /api/releases/:version`, `GET /api/release-markers`, and `serviceVersion` on the instance list,
request and job details. Left:

- Web: a "Releases" page (list with verdicts, detail with the before/after dot chart, new error groups
  and instances), release markers on the request and job charts, and the version on the instance list
  and in request/job details.
- Per-version numbers: comparisons cover all of an application's traffic, so rolling deploys dilute
  them. Needs a version dimension in the minute rollups (or a rollup of its own) if it matters.
- Optional: compare a release with the previous one's whole lifetime (not just the window before the
  boundary), and notify on `regression`.
