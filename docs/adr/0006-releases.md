# ADR 0006: Releases: version history, boundaries and before/after verdicts

- Status: accepted
- Date: 2026-10-30

## Context

Every request, job and instance carries the agent's `serviceVersion` (`OBSERVE_SERVICE_VERSION`, the
commit the platform exposes, or the `serviceVersion` option). The dashboard should list the releases
of a project, mark them on the request and job charts, and say whether a release made things worse:
error rate and latency before and after, error groups it introduced, and which operations moved.

`services` only keeps the latest version of each instance, so "when did this version appear" needed a
scan of `requests` and `jobs` grouped by version, and the minute rollups (ADR 0003) have no version
dimension: adding one would multiply their rows on every deploy that overlaps.

## Decision

**Version history.** A plain table `service_versions (application_id, service_id, service_version,
first_seen_at, last_seen_at)`, primary key on the first three, one row per instance and version.
Ingest upserts one row per batch (a batch is one instance and one version) in the batch's transaction,
right after `services`: `least` of `first_seen_at`, `greatest` of `last_seen_at`. The times are the
span of the batch's accepted executions (`calledAt`), or the time it was received when it carries
none. Batches without a version are skipped. Migration 0011 backfills it with `min/max(called_at)` per
application, instance and version from `requests` and `jobs`, one day partition at a time, then adds
the current version of each `services` row at its `last_seen_at`.

Indexes: the primary key for per-application reads, `(application_id, first_seen_at desc)` for the
boundaries in a range, `(last_seen_at)` for retention, and `error_groups (application_id,
first_seen_at)` for the error groups a release introduced.

Retention: rows whose `last_seen_at` is older than `AGGREGATE_RETENTION_DAYS` are deleted by the hourly
maintenance job (the rollups a comparison needs are gone by then); deleted applications are purged
with the rest of their telemetry. A version still running keeps its row, whatever its age.

**Release = (application, version).** Its **boundary** is the earliest `first_seen_at` of the version
across the application's instances. A rollback and redeploy of the same version keeps the original
boundary: the history is per version, not per deployment. The **previous version** is the version of
the same application with the latest boundary before this one. An instance is **running** a version
when `services` says it is its latest version and it reported in the last 5 minutes.

**Comparison windows.** `window` is one of `15m`, `30m` (default), `1h`, `3h`. On whole minutes of
`requests_1m` and `jobs_1m`, for the release's application only:

- before = `[m - window, m)`, where `m` is the start of the minute containing the boundary;
- after = `[m + 1 min, m + 1 min + window)`.

The boundary minute is left out because it mixes both versions. While the after window has not
elapsed, `complete` is false and the after side holds what exists so far. Latency percentiles come
from the rollups' histograms, as everywhere else.

**Verdict.** Per kind (requests, jobs):

| Rule                                                    | Requests                  | Jobs                       |
| ------------------------------------------------------- | ------------------------- | -------------------------- |
| `insufficient_data` when either side has fewer than     | 50 requests               | 20 runs                    |
| error (failure) rate worse/better when it moves by both | x1.5 relative and 1 point | x1.5 relative and 2 points |
| p95 worse/better when it moves by both                  | x1.25 relative and 25 ms  | x1.25 relative and 100 ms  |

"Worse" means `after - before >= absolute` and `after >= before * relative`; "better" is the mirror
(`before - after >= absolute` and `after * relative <= before`). Any worse metric makes the kind a
`regression`; otherwise any better one makes it `improving`; otherwise `stable`. The release's verdict
is the worst verdict among the kinds with enough data (`regression` > `improving` > `stable`), and
`insufficient_data` when neither has. `signals` lists the thresholds crossed (`error_rate_up`,
`error_rate_down`, `p95_up`, `p95_down`; the error rate is the failure rate for jobs).

**New error groups** of a release: error groups of the application whose `first_seen_at` is in
`[boundary, boundary + window)`. Groups are per application, not per version.

**Per-operation and per-job impact** (release detail): the 10 operations (operation id, protocol,
method) and 10 jobs (queue, name) with the most executions over both sides, with count, error rate,
average and p95 before and after. The release's own comparison is the all-traffic row.

**Routes** (`releases` tag): `GET /api/releases` (releases whose boundary is in the range, default
`7d`, newest first, keyset on `(boundary, application, version)`, at most 100 per page),
`GET /api/release-markers` (boundaries in the range for chart markers; with `instance`, that instance's
version switches) and `GET /api/releases/:version` (the detail; `application` is required only when
several applications of the project reported the version, else 400). The markers have their own path
so that no version string can shadow them.

**Read path.** The releases of a scope are one aggregate over its `service_versions` rows (primary
key) with `lag()` for the previous version. A comparison joins a `values` list of (release, side,
application, from, to) to the rollup on `(application_id, minute)`, the leading primary key columns,
within the overall window of all sides for partition pruning: one grouped query for the sums and one
for the histogram cells, for every release of a page at once. Per-operation impact reads the sums of
every group, then the cells of the top groups only.

## Consequences

- **Dilution with rolling deploys.** The comparison covers all of the application's traffic, not the
  new version's only: during a rolling or canary deploy the after window still includes instances on
  the previous version, which dampens a regression, and the before window may include an earlier
  release still rolling out. A short window right after the boundary is the most diluted; a longer
  one dilutes the other way (later changes, traffic patterns). Per-version numbers would need a
  version dimension in the rollups (or a rollup of their own), which we chose not to pay for yet.
- Comparisons are about correlation in time: a traffic spike or an incident elsewhere near a deploy
  shows up as the release's verdict. The thresholds are deliberately coarse and the minimum counts
  keep quiet applications at `insufficient_data` rather than flipping on a handful of requests.
- Error groups are fingerprinted per application, so a "new" group is new to the application, and an
  error that existed before the release (even rarely) never shows up as introduced by it.
- `service_versions` holds instances x versions: with many short-lived instances (pods) and frequent
  deploys it grows by pods per deploy, which the 90-day prune keeps to a few hundred thousand rows at
  worst. The scope aggregate reads all of them for the project's applications; if that ever gets slow,
  a per-(application, version) table maintained at ingest would replace it.
- Versions reported before migration 0011 only have the boundary their oldest retained execution gives
  (raw tables keep `RETENTION_DAYS`).
