# ADR 0005: Storage usage per application, and trims of old data

- Status: accepted
- Date: 2026-10-30

## Context

The dashboard should show how much each project and application takes in the database, and let an
operator free space without losing recent data ("delete data older than N days" for a project or
one application, below the global `RETENTION_DAYS`).

Telemetry tables are shared by every application and partitioned by UTC day (ADR 0001, 0002), so
PostgreSQL knows the size of a partition but not of one application's rows in it. Scanning the raw
tables to measure them (`pg_column_size` over every row) costs a full read of the database per view.

## Decision

### Usage counted at ingest: `application_usage`

One row per application, UTC day and raw table (`requests`, `jobs`, `error_occurrences`, `logs`,
`runtime_metrics`, `custom_metrics`, `profiles`: the application-scoped tables written at ingest) with
`rows` and `bytes`. Ingest adds a batch's counts in the batch's transaction, as its last statement
(every batch of an application hits the same few rows of the day, so their locks are held only until
the commit), sorted by key like the other upserts. The profile writer does the same in its own
transaction. Rollups, error groups and services are not counted per application.

`bytes` is a cheap estimate of the stored row: 24 bytes of tuple overhead plus, per non-null value,
the UTF-8 length of strings with a varlena header (16 for uuids), 8 for numbers and timestamps, 1 for
booleans (`ingest/infrastructure/usage-tally.ts`). It is the uncompressed size. Migration 0010
backfilled the existing rows with the same formula in SQL, summing `pg_column_size` of each column
(the stored, possibly compressed, size; per column it does not fetch TOAST data, unlike
`pg_column_size(t.*)`).

The counters stay consistent with the data: retention deletes the days whose partitions it dropped,
the application purger deletes the application's rows (last), and a trim deletes the trimmed days.

### Real size, apportioned

The API shows real sizes: `pg_total_relation_size` (heap, TOAST and indexes) per table and per day
partition, and `pg_database_size`. An application's size in a day partition is its share of the
counted bytes of that partition times the partition's real size; `profiles`, which is not
partitioned, is split the same way over all its days (`storage/domain/apportion.ts`). It is an
estimate, documented as such in the DTOs:

- Dead space left by deletes (until the space is reused) and index bloat count for the rows that are
  still there. A partition whose rows were all deleted is attributed to nobody (it shows in the
  instance-wide partition list only).
- On the day of the migration, backfilled rows count their compressed size and new rows their
  uncompressed size; from then on every row is counted the same way.

### Trims: `storage_trims` and `StorageTrimmer`

`POST /api/projects/:project/storage/trims { keepDays, application? }` validates
`1 <= keepDays < RETENTION_DAYS`, computes the cutoff day (`today - keepDays`, the same rule as
retention: today and the `keepDays` previous days are kept, so with 14 days stored, 7 deletes the days 8
to 14 days ago) and queues a row. One row per target (project, or project and application;
`unique nulls not distinct`): a new request for a pending target keeps the later cutoff. The response
is `202` with the pending trim; `GET .../storage/trims` and the project storage view list the pending and
running ones with `doneSteps` / `totalSteps`.

`StorageTrimmer` (maintenance module, triggered by the request and by every hourly maintenance run)
processes the queue like `ApplicationPurger`: for each raw table, each partition of a day before the
cutoff (the cutoff is a day boundary, so the partition of the cutoff day holds no older rows), it
deletes the target applications' rows in batches of 10 000 (`ctid = any(array(select ctid ... limit))`,
each a short transaction over the `application_id` indexes, also filtering the time column, which is
what bounds `profiles`), then runs a plain `VACUUM` on that partition, and saves its progress. The
usage rows of the trimmed days go last, then the trim row. A crash restarts the trim on the next run:
partitions already trimmed cost one index lookup. Rollups (charts and stats) and error groups keep their
own retention and are not trimmed.

### Freeing disk

After a trim or an application purge, every table or partition the worker deleted from gets a plain
`VACUUM`, one at a time, outside a transaction, with failures logged. It makes the dead rows' space
reusable by new telemetry at once and gives the empty pages at the end of the heap back to the OS.
`VACUUM FULL` would free everything but locks the partition, which does not fit a live collector.

## Consequences

- The storage views read the catalog and a table of applications x days x 7 rows: no scan of the
  telemetry. On the dev database (12 partitions per table) each view answers in tens of milliseconds.
- Ingest does one more upsert per batch (up to 7 rows).
- Deletes do not shrink indexes, and `VACUUM` only truncates the heap's trailing empty pages, and only
  when it gets a brief exclusive lock. After the seeded demo project was purged (and vacuumed by hand),
  its partitions kept ~5 GB: `requests_p20261028` has no live rows and 432 MB of heap plus 315 MB of
  indexes. The apportioning credits such space to the applications left in a partition (the
  2026-10-29 `requests` partition, 1.9 GB, is all attributed to the ~5 k requests of one application). The disk shrinks fully only when the partitions age out of `RETENTION_DAYS`, or with the
  remaining options in `TODO.md` (truncate or drop partitions a purged application had alone,
  partitioning by application).
- Per-project retention (an override of `RETENTION_DAYS` applied by maintenance) is not implemented.
