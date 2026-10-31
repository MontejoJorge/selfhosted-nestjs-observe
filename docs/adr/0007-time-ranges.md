# ADR 0007: Time range presets, custom windows and days with data

- Status: accepted
- Date: 2026-10-30

## Context

The query API had three relative ranges (`1h`, `24h`, `7d`) with fixed bucket widths (1 min, 15 min,
3 h), and the dashboard's range control showed exactly those. Users want finer and longer presets,
their own choice of three per project, and arbitrary windows picked on a calendar that should not
offer days without telemetry.

## Decision

**Presets.** `TimeRange` is `1h | 3h | 6h | 12h | 24h | 3d | 7d | 15d` (`TIME_RANGES`, shortest first;
lengths in `RANGE_MS`). The default stays `1h`, and `GET /releases` still defaults to `7d`.

**Buckets.** `bucketSeconds` keeps picking the smallest width of `1 min, 5 min, 15 min, 30 min, 1 h,
3 h, 6 h, 12 h, 1 d` that gives at most 100 buckets:

| Range | Width  | Buckets |
| ----- | ------ | ------- |
| 1h    | 1 min  | 60      |
| 3h    | 5 min  | 36      |
| 6h    | 5 min  | 72      |
| 12h   | 15 min | 48      |
| 24h   | 15 min | 96      |
| 3d    | 1 h    | 72      |
| 7d    | 3 h    | 56      |
| 15d   | 6 h    | 60      |

Custom windows use the same list (31 days -> 12 h, 62 buckets). Every width of 15 min or more divides
whole quarters and every width of 1 h or more whole hours, so the users rollups keep their rule (ADR
0004): distinct users per bucket read `users_1h` for widths of 1 h or more, `user_presence_15m` for 15
and 30 min, and raw `requests` for 1 and 5 min (up to 6 h of raw rows); a user's timeline reads the
rollup for widths of 1 h or more and raw requests below. The minute rollups serve any width.

**Custom windows.** Every route that takes `range` also takes `from`/`to` (`RangeQueryDto`,
`resolveWindow`): `from` wins over `range`, `to` defaults to now, and with only `to` the window is the
range ending there. Both must be full ISO 8601 date-times with an offset (`Z` or `+hh:mm`), `from`
before `to`, and at most 31 days apart (`MAX_WINDOW_DAYS`); otherwise 400. A window older than
`RETENTION_DAYS` is valid: raw lists come back empty and the rollups (kept for
`AGGREGATE_RETENTION_DAYS`) still serve stats and charts.

**Per-project presets.** `projects.range_presets text[]` (migration 0012, default `{1h,24h,7d}`, a check
for exactly three values of the enum), returned as `rangePresets` and set through
`PATCH /projects/:project` (three distinct values, stored shortest first).

**Days with data.** `GET /projects/:project/data-days?application=` returns the UTC days with
telemetry between `today - AGGREGATE_RETENTION_DAYS` and tomorrow. One statement: the days of
`application_usage` (a primary-key range per application), plus one existence probe per remaining
day on `requests_1m` and `jobs_1m` (rollups outlive raw rows, and trims remove usage rows). The
remaining days are materialized first, and each probe's bounds come from its day, so run-time
pruning opens one partition per probe.

## Consequences

- Adding a preset means extending `TIME_RANGES`, `RANGE_MS` and the `projects_range_presets_check`
  constraint (a migration).
- 15d reaches past the default raw retention (14 days): its lists and raw-backed views (logs, runtime
  metrics, error timelines) have a gap at the start; rollup-backed views do not.
- The 3h and 6h user activity timelines count distinct users from raw requests.
