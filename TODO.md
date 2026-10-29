# TODO

Data the collector already stores but nothing reads yet. Not scheduled.

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
