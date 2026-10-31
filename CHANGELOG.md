# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-31

### Added

- **Storage page** (`/storage`, also in the far-left rail): database size, size per table, per-day
  partitions and the space each project takes.
- **Project storage** under Settings: what each application keeps per day, and "delete data older
  than N days" for the whole project or one application. The deletion runs in the background and
  shows its progress. Settings also shows a storage summary.
- Storage usage is counted per application at ingest. Migration `0010` adds `application_usage` and
  `storage_trims` and backfills the counts from existing data in one pass over every partition, so the
  first start after upgrading can take a while on a large database.
- **Releases page**: every version an application reported, with its release date, when it was last
  seen, how many instances ran it and the version before it. Migration `0011` adds `service_versions`
  and backfills it from the stored requests and jobs.
- Deploy markers on the request and job charts.
- The version is shown, and links to Releases, in request and job details, on the trace page and in
  the profiler's instance list.
- Before/after release comparison in the API (`GET /api/releases/:version`): error rate, latency,
  new error groups and the operations and jobs that moved. Not shown in the dashboard yet.
- Rows-per-page selector (8, 25, 50, 100) on the Services table.
- Example app: requests now carry a user id (`x-user-id`) from a pool of 14 users, a few much busier
  than the rest, and new stock and reservation endpoints and the reconcile job use a local SQLite
  database (`SQLITE_FILE`) with traced queries (`db.system: sqlite`).
- More time ranges: 1H, 3H, 6H, 12H, 24H, 3D, 7D and 15D. Each project picks the three shown in its
  page headers on the Settings page (1H, 24H and 7D by default).
- Custom time range: a calendar next to the range control picks any window of up to 31 days, with
  start and end times. Days without telemetry are greyed out, the window is kept in the URL across
  pages, and LIVE is off while it is shown.
- **Demo mode**: `pnpm --filter web dev:demo` (or `build:demo`) runs the dashboard with no backend, on
  generated telemetry for two fictional projects, with releases, errors, traces and runtime metrics.
  A manual workflow publishes it to GitHub Pages. `BASE_PATH` serves the dashboard from a sub-path.
- Unit tests for the API and the dashboard (`pnpm test`), and a CI workflow that runs lint, typecheck,
  tests and the format check on every push and pull request.

### Changed

- **Only `@nestjs/observe` 0.3.20 or earlier is supported.** Later agent releases ship under a license
  that only allows sending telemetry to NestJS Observe, so they must not be pointed at this collector
  (see [issue #1](https://github.com/MontejoJorge/selfhosted-nestjs-observe/issues/1)). The API and
  the example app now pin the agent to exactly 0.3.20.
- Relicensed under **MIT** (was AGPL-3.0 with the Commons Clause).
- Raw spans are no longer stored. Migration `0009` **drops the `spans` table**, which was most of the
  database. Trace waterfalls, the trace page and Services work as before.
- Deleting an application and trimming old data now run `VACUUM` on each partition they touched, so
  the freed space is reused right away.
- Project cards chart request volume over the selected range, with a label for the range.
- Page subtitles across the dashboard are rewritten in our own words.

### Fixed

- LIVE no longer refreshes request and job detail pages.
- Select dropdowns open below their trigger, with padding around the options.
- Project card charts no longer clip at the edges or show a focus outline when clicked.
- The Services ≥ / ≤ filter is a styled toggle instead of the browser's native dropdown.
- "Where the time goes" tiles stay readable: classes too small to draw are summed in an "Others" row.
- One event with an absurd timestamp (past year 10889) no longer makes the whole telemetry batch fail
  with a 500: it is dropped like any other event outside the accepted time window.
- Durations that round up to the next unit show in that unit: 999.6 ms reads "1.00 s", not "1000 ms".

### Removed

- `POSTGRES_USER` and `POSTGRES_DB` from the Docker Compose files: the database user and name are
  always `observe`. If you had changed them, set them back or migrate your data before upgrading.

## [0.1.0] - 2026-10-29

First release. A drop-in collector and dashboard for the `@nestjs/observe` agent: requests, jobs,
errors, logs, traces and runtime metrics in a single PostgreSQL database, shipped as a Docker image.

[1.0.0]: https://github.com/MontejoJorge/selfhosted-nestjs-observe/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/MontejoJorge/selfhosted-nestjs-observe/releases/tag/v0.1.0
