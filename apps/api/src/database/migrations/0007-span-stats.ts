import { sql, type Kysely } from 'kysely';

/**
 * 5-minute rollup of spans for the time breakdown (ADR 0004).
 *
 * One row per application, bucket, instance, execution source, operation (operationId,
 * or `queue/name` for jobs), origin, class and method, with calls, errors, total and
 * self time (duration minus direct children), min/max, the latency histogram of
 * ADR 0003, and a reference to the slowest span of the row (`max_*`) for the
 * slowest-spans drill-down. Day-partitioned and kept for AGGREGATE_RETENTION_DAYS.
 *
 * Not backfilled: computing self time from the existing `spans` took ~60 s per day of
 * seeded data (8 M spans), so the view covers spans ingested from now on.
 */
export const spanStats = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table span_stats_5m (
        application_id uuid not null,
        bucket timestamptz not null,
        service_id text not null,
        source text not null,
        operation text not null,
        origin text not null,
        class_name text not null,
        method_name text not null,
        calls int4 not null,
        errors int4 not null,
        total_ms double precision not null,
        self_ms double precision not null,
        min_ms double precision not null,
        max_ms double precision not null,
        histogram int4[] not null,
        max_execution_id uuid not null,
        max_trace_id text not null,
        max_called_at timestamptz not null,
        max_self_ms double precision not null,
        last_called_at timestamptz not null,
        primary key (
          application_id, bucket, service_id, source, operation, origin, class_name, method_name
        )
      ) partition by range (bucket)
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists span_stats_5m`.execute(db);
  },
};
