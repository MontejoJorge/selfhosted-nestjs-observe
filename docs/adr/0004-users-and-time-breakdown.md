# ADR 0004: Rollups for users and for the time breakdown

- Status: accepted
- Date: 2026-10-29

## Context

Two new dashboard views aggregate over the selected range:

- **Users**: the requests made on behalf of each user id (`http.getUserId`, stored in `requests.user_id`)
  with count, error rate, latency percentiles and first/last seen, plus one row for the anonymous
  requests (no user id); above the table, the number of distinct users in the range and a timeline of
  distinct active users and requests per bucket; and one user's request timeline.
- **Where the time goes**: span time per class and method (and outbound call), with total and **self**
  time (span duration minus its direct children's durations, at least 0), share of the total self time,
  calls and p95, filterable by execution source and operation. Clicking a method lists its slowest spans.
  (Superseded in the UI by Services and the dashboard treemap; see the revision at the end.)

ADR 0003 rules out aggregating the raw tables over the range: the seeded database has ~5.7 M requests
and ~58 M spans (~8 M spans and ~780 k requests a day, ~31 GB) over 8 days, and a full scan of a day
takes seconds. `requests_1m` cannot answer either view: it has no user and no span dimension, and adding
one would multiply its rows.

Measured cardinalities on one seeded day (2026-10-27):

| Key                                                     | Rows/day |
| ------------------------------------------------------- | -------- |
| requests with a user id                                 | 779 k    |
| user × minute                                           | 651 k    |
| user × hour                                             | 48 k     |
| user × hour × instance (3 instances)                    | 132 k    |
| spans                                                   | 8.1 M    |
| operation × class method × instance × 5 min (with jobs) | 26 k     |
| operation × class method × instance × hour              | 1.9 k    |

The seed has 2,000 users with ~450 requests a day each (90% of the requests carry a user), 4 request
operations with spans, 2 jobs and 30 class methods.

## Options

**Users.**

1. Aggregate `requests` by `user_id` over the range: one full scan per view (seconds at 7 days).
2. A per-minute user rollup: 651 k rows/day against 779 k requests, so no gain.
3. An hourly user rollup, with or without the instance.

**Time breakdown.**

1. Aggregate `spans` over the range: ~56 M rows at 7 days, and self time needs a self-join on
   `(execution_id, parent_position)`.
2. A span rollup written at ingest, where the flattened tree of each execution is in memory and self
   time is a single pass.

**Slowest spans drill-down.**

1. Read `spans` through a new index `(application_id, class_name, method_name, duration_ms desc)`.
   Measured on one day partition: 24 s to build, 566 MB (≈ 4.5 GB for 8 days, a fifth of the table), one
   more index to maintain on the most written table, and still 1.7–2.2 s for the top 50 of one day
   (random heap reads of large rows).
2. Keep a reference to the slowest span in each rollup row and read the rollup.

## Decision

### `users_1h`

One row per application, UTC hour and user id: `count`, `errors`, `status_4xx`, `status_5xx`, duration
`sum_ms`/`min_ms`/`max_ms`, the latency histogram of ADR 0003, `first_called_at` and `last_called_at`.
Requests without a user id are kept under `user_id = ''` (the API returns `userId: null` for that
row). Written at ingest in the batch's transaction, day-partitioned, kept for
`AGGREGATE_RETENTION_DAYS`, backfilled from `requests` by migrations 0006 (identified users) and 0008
(anonymous rows).

- **Hourly, not per minute**: per-minute rows are as many as the requests. Hourly rows are 16× fewer.
- **No instance dimension**: it multiplies the rows by the instances serving each user (2.8× here, more
  with autoscaling or redeploys, since every new instance id is a new key). The users endpoints answer
  `400` when `instance` is passed instead of returning numbers that ignore it.
- **Exact windows**: the read takes the whole hours of the window from `users_1h` and the partial hours
  at both ends from `requests` (at most two hours of raw rows, through the `(application_id, called_at)`
  index), unioned before grouping. The raw rows get their histogram bucket in SQL with the same formula.
- **List in two steps**: totals per user, sorted and limited in SQL, then the histogram cells of the
  returned users only. Unnesting every user's histograms over 7 days took 1.0 s; the two steps take
  ~0.35 s.
- **User timeline**: buckets of 3 h or more (the 7d range) are whole hours and read the rollup plus the
  edges. Finer buckets (1h and 24h ranges) read the user's raw requests through the new index
  `requests (application_id, user_id, called_at desc, id desc) where user_id is not null`, which also
  serves the `userId` filter of the request list.
- User ids are truncated to 255 characters at ingest so they always fit a btree index entry.

### Distinct active users: `user_presence_15m`

Distinct counts cannot be summed across buckets, so the activity timeline reads, for each bucket width,
a source whose grain divides it: `users_1h` for the 3 h buckets of the 7d range, a presence table for
the 15-minute buckets of the 24h range, and raw `requests` for the 1-minute buckets of the 1h range (one
hour of rows). Counting distinct users per 15 minutes on raw rows over 24 h took 18 s cold and 1.6 s
warm.

`user_presence_15m` has one row per application, 15-minute bucket and identified user, and no other
column: ingest inserts it with `on conflict do nothing`. 167 k rows/day on the seed (a fifth of the
requests), 1.1 M in total, backfilled by migration 0008. Request counts per bucket come from
`requests_1m`. Distinct counts group by `(bucket, user)` first and count the groups: a hash aggregate,
0.04–0.12 s at 7d against 0.6–0.7 s for `count(distinct user_id)`.

### `span_stats_5m`

One row per application, 5-minute bucket, instance, execution `source`, `operation` (operationId, or
`queue/name` for jobs), `origin`, `class_name` and `method_name`, with `calls`, `errors`, `total_ms`,
`self_ms`, `min_ms`, `max_ms`, the latency histogram of the span duration, and the slowest span of the
row: `max_execution_id`, `max_trace_id`, `max_called_at`, `max_self_ms`.

- **Self time at ingest**: the trace flattener sums each span's direct children and stores
  `max(0, duration - children)`; children that ran concurrently can add up to more than their parent.
  Spans without a duration are left out.
- **5 minutes, with the instance**: the view has no timeline, so the bucket only sets how precisely the
  window starts (it starts at the bucket containing `from`) and how many slowest-span candidates exist.
  At 26 k rows/day the 7d read stays well under a second (see below); hourly buckets would make the 1h
  range cover up to two hours and leave a dozen drill-down candidates. The instance stays a dimension
  so the `instance` filter works.
- **Upsert**: counts and sums are added, min/max with `least`/`greatest`, histograms with
  `histogram_add`, and the slowest-span columns are replaced when the incoming row's `max_ms` is larger.
- **Drill-down from the rollup** (option 2): the slowest spans of a method are the rollup rows of that
  method in the window, by `max_ms` desc. It is the slowest span per bucket, instance and operation, not
  the exact top N: a burst of slow calls in the same five minutes shows once. In exchange it costs no
  index and no scan of `spans`, and honours every filter of the view.
- **No backfill**: computing self time from the stored `spans` (aggregate children per
  `(execution_id, parent_position)`, join back, join `requests`/`jobs` for the operation) took ~60 s per
  seeded day (up to 200 s on the busier days; 16 min for the 8 days), too long for a migration that runs
  at boot. The view covers spans
  ingested after migration 0007.

## Consequences

- Users: `users_1h` holds 329 k rows (113 MB) for 5.06 M requests with a user; migration 0006 backfilled
  it in ~1.5 min, including the 371 MB user index on `requests`. Counts, errors, averages and first/last
  seen are exact; p50/p95 were within 1% of `percentile_cont`.
- Measured on the seeded database (warm, through the API): `GET /users` (table, user count and
  activity timeline) 0.19–0.22 s at 24h and ~0.53 s at 7d; `GET /users/:userId` 0.01–0.02 s at 24h and
  0.02–0.05 s at 7d; `GET /requests?userId=` 0.01–0.02 s at 7d. Distinct users per bucket and request
  counts were exact against the raw rows.
- Time breakdown: 26 k rollup rows/day. To measure it, the seeded spans of one application were
  aggregated into `span_stats_5m` once by hand (~16 min for the 8 days, outside the migrations). Then
  `GET /time-breakdown` took 0.14–0.19 s at 24h and ~0.45 s at 7d (0.11–0.13 s with a source or instance
  filter), and `GET /time-breakdown/spans` 0.02 s at 24h and ~0.055 s at 7d. Calls, total and self time
  and max matched a self time computed from `spans` in SQL exactly.
- Ingest does three more writes per batch: a user row per user and hour, a presence row per user and
  15 minutes, and a span row per bucket, instance, operation and method (~30 per batch on the seed).
- `spans` is no longer needed by any view: it keeps the flattened tree for future analytics and could be
  dropped (with its write cost) if nothing else comes to use it.
- A user rollup row per user and hour does not shrink much for users with one or two requests an hour.
  With hundreds of thousands of active users, add a daily level for long ranges.

## Revision (2026-10-29): Services and the dashboard treemap

To match the hosted dashboard, the standalone "Where the time goes" page became two views over the same
`span_stats_5m` rollup:

- **Services** (Activity menu): one row per class with own time (`self_ms`) and its share, average own
  time per call, total time, calls, errors and method count; a row expands into its methods. Filters: one
  class, and a ≥/≤ threshold on the average own or total time per call.
- **Where the time goes** (a card on the project dashboard): the top 10 classes by own time as a
  squarified treemap, each tile linking to Services filtered to that class, and a strip for the rest.

`GET /time-breakdown` became `GET /services`: one grouped query per class and method (no histogram query,
since neither view shows percentiles), folded into classes in the repository; ~0.09 s at 7d on the seed.
Spans of every origin count together. Outbound calls, which the agent reports with their kind as a
lowercase class name (`http`, `pg`), are left out: Services lists classes, and their time already counts
in the total time of the class that awaited them. `GET /services/spans` keeps the slowest-span read from
the rollup's `max_*` columns, without the `origin` filter; no view calls it for now.

## Revision (2026-10-30): raw spans are no longer stored

Migration 0009 dropped `spans`. No query read it: waterfalls read `requests.trace` / `jobs.trace`, the
trace page reads requests, jobs and logs by trace id, and Services and the treemap read `span_stats_5m`,
whose slowest spans are its `max_*` columns. It was still the most written table and the largest: 21 of
the 31 GB of the seeded database. Ingest keeps flattening each execution's tree in memory
(`flattenTrace`, which also computes self time) and rolls it up into `span_stats_5m`; it just no longer
inserts one row per span. Analytics that need individual spans would have to read the `trace` jsonb of
the executions, or bring back a narrower table.
