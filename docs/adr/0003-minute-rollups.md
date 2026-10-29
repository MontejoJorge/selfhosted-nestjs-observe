# ADR 0003: Per-minute rollups for stats and timelines

- Status: accepted
- Date: 2026-10-29

## Context

The overview, the operations and queue lists, and the project and application cards aggregate
executions over the selected range: counts, error rates, p50/p95/p99 and a timeline. They ran on the raw
`requests` and `jobs` rows, so their cost grew linearly with traffic in the range.

With 7 days and ~5.7 M requests (seeded, ~31 GB including spans), the 7d overview took ~28 s and the
24h overview and operations hit the pool's 10 s connection timeout (HTTP 500) when several ran at once.
An index does not help: these queries need every row in the range. ADR 0001 already named rollup tables
as the first mitigation.

Options considered:

1. **Rollups written at ingest**: the collector upserts per-minute aggregates in the batch's transaction.
2. **Rollups built by a cron** (`INSERT ... SELECT` over the last closed minutes): needs a watermark,
   a re-aggregation window for late or backdated events, and lags up to a minute.
3. **TimescaleDB continuous aggregates**: an extension to install and run, against the goal of a plain
   PostgreSQL that is easy to self-host.

## Decision

Option 1. Two day-partitioned tables, `requests_1m` and `jobs_1m`, with one row per application, UTC
minute, instance (`service_id`) and operation (`operation_id`, `protocol`, `method`) or job (`queue`,
`name`). Each row holds:

- `count`, `errors` (or `failed`), `status_4xx`, `status_5xx`, the duration `sum_ms`, `min_ms`, `max_ms`,
  `last_called_at`, and for jobs the wait time sum and count;
- `histogram`: a log-scale latency histogram as a dense `int4[]` trimmed after its last non-empty bucket.
  Bucket 0 is under 1 ms; bucket i covers `[2^((i-1)/4), 2^(i/4))` ms, four per doubling (~19% wide),
  up to ~4.7 h. Percentiles cannot be averaged across minutes, but histograms can be summed.

**Write path.** The domain mapper groups a batch's executions per key (`ingest/domain/rollups.ts`), and
the writer upserts them, in key order, in the same transaction as the raw rows:
`insert ... on conflict do update` adds counts and sums, takes `least`/`greatest` for min and max, and
merges histograms with the SQL function `histogram_add` (element-wise sum). Late and backdated events
land in their own minute with no extra work, and the current minute is visible right away.

**Read path.** Stats and timelines run two queries per view in parallel: one grouped query for sums,
min and max, and one that unnests the histograms into `(bucket, count)` cells summed per group (cheaper
than merging arrays row by row: ~0.3 s against ~1.6 s for a custom aggregate on 7 days). Percentiles are
interpolated inside the bucket that holds each rank and clamped to the observed min and max
(`telemetry/common/rollups.ts`). Rollups cover whole minutes, so a window starts at the minute that
contains `from`.

Lists, details, traces, error groups and logs still read the raw tables: they need fields that are not
aggregated (user, status code, URL, trace).

**Retention.** Raw telemetry keeps `RETENTION_DAYS` (14); rollups keep `AGGREGATE_RETENTION_DAYS` (90,
never less than `RETENTION_DAYS`). Both drop whole day partitions in the hourly maintenance job. Charts
and stats remain available for days whose executions are gone; the lists are empty there.

**Backfill.** Migration 0005 creates the tables and fills them from the existing `requests` and `jobs`,
one day partition at a time, with the same bucket formula in SQL.

## Consequences

- With the same 5.7 M requests, the rollups hold 119 k request rows and 20 k job rows (54 MB). The 7d
  overview went from ~28 s to ~0.3 s, the 7d operations list from ~14 s to ~0.27 s. Counts, error counts
  and averages are exact; p50/p95/p99 were within 2% of `percentile_cont` (the bound is the bucket width,
  ~10%).
- Ingest does one more upsert per batch and table, a few dozen rows. Concurrent batches only contend on
  the same application, minute, instance and operation, and rows are locked in key order.
- New aggregate views (per user, per release) need either a new dimension in these tables, which
  multiplies their rows, or their own rollup.
- The rollups only filter by application, instance and operation or job. Filters on other fields (status
  code, user, minimum duration) must use the raw tables.
- At 90 days, a fleet with hundreds of operations and many instances can reach tens of millions of rollup
  rows. If long ranges get slow, add an hourly level built from the minute rows.
