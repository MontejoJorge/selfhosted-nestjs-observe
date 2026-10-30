import { sql, type Kysely } from 'kysely';

/**
 * Drops `spans`, the flattened span trees (ADR 0004, revision of 2026-10-30).
 *
 * No view read it: waterfalls read `requests.trace` / `jobs.trace`, and Services reads the
 * `span_stats_5m` rollup, which ingest still computes from the flattened tree in memory.
 * It was the largest table (two thirds of the database) and the most written one.
 * Dropping the partitioned parent drops its partitions and indexes.
 */
export const dropSpans = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists spans`.execute(db);
  },

  /** Recreates the empty parent table; its partitions and data are gone. */
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table spans (
        execution_id uuid not null,
        called_at timestamptz not null,
        application_id uuid not null,
        source text not null,
        service_id text not null,
        trace_id text not null,
        position integer not null,
        parent_position integer,
        depth integer not null,
        span_id text,
        parent_span_id text,
        name text,
        origin text not null,
        class_name text not null,
        method_name text not null,
        duration_ms double precision,
        start_offset_ms double precision,
        has_error boolean not null,
        tags jsonb,
        error jsonb,
        primary key (execution_id, position, called_at)
      ) partition by range (called_at)
    `.execute(db);
    await sql`create index spans_called_at_brin on spans using brin (called_at)`.execute(
      db,
    );
  },
};
