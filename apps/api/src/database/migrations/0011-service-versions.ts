import { sql, type Kysely } from 'kysely';

/**
 * Version history per instance (ADR 0006).
 *
 * `service_versions` holds one row per application, instance (`service_id`) and version,
 * with the first and last time that instance reported it. Ingest upserts it in the
 * batch's transaction. A release (application, version) starts at the earliest
 * `first_seen_at` of its rows.
 *
 * Indexes: the primary key serves the per-application reads; `(application_id,
 * first_seen_at)` the release boundaries in a time range; `(last_seen_at)` the retention
 * prune. `error_groups (application_id, first_seen_at)` serves "error groups first seen
 * after a release".
 *
 * Backfill: `min/max(called_at)` per application, instance and version from `requests`
 * and `jobs`, one day partition at a time (each a single grouped scan merged with
 * `on conflict`), then the current version of every `services` row at its `last_seen_at`
 * (instances that sent no executions under it).
 */
const PARTITIONED = ['requests', 'jobs'];

async function partitionsOf(
  db: Kysely<unknown>,
  table: string,
): Promise<string[]> {
  const { rows } = await sql<{ child: string }>`
    select child.relname as child
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    join pg_namespace ns on ns.oid = child.relnamespace
    where ns.nspname = current_schema() and parent.relname = ${table}
    order by child.relname
  `.execute(db);
  return rows.map((row) => row.child);
}

export const serviceVersions = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table service_versions (
        application_id uuid not null,
        service_id text not null,
        service_version text not null,
        first_seen_at timestamptz not null,
        last_seen_at timestamptz not null,
        primary key (application_id, service_id, service_version)
      )
    `.execute(db);
    await sql`
      create index service_versions_app_first_seen_idx
        on service_versions (application_id, first_seen_at desc)
    `.execute(db);
    await sql`
      create index service_versions_last_seen_idx on service_versions (last_seen_at)
    `.execute(db);
    await sql`
      create index error_groups_app_first_seen_idx
        on error_groups (application_id, first_seen_at)
    `.execute(db);

    for (const table of PARTITIONED) {
      for (const partition of await partitionsOf(db, table)) {
        await sql
          .raw(
            `insert into service_versions
               (application_id, service_id, service_version, first_seen_at, last_seen_at)
             select application_id, service_id, service_version, min(called_at), max(called_at)
             from ${partition}
             where service_version is not null
             group by 1, 2, 3
             on conflict (application_id, service_id, service_version) do update set
               first_seen_at = least(service_versions.first_seen_at, excluded.first_seen_at),
               last_seen_at = greatest(service_versions.last_seen_at, excluded.last_seen_at)`,
          )
          .execute(db);
      }
    }

    await sql`
      insert into service_versions
        (application_id, service_id, service_version, first_seen_at, last_seen_at)
      select application_id, service_id, service_version, last_seen_at, last_seen_at
      from services
      where service_version is not null
      on conflict (application_id, service_id, service_version) do update set
        last_seen_at = greatest(service_versions.last_seen_at, excluded.last_seen_at)
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop index if exists error_groups_app_first_seen_idx`.execute(db);
    await sql`drop table if exists service_versions`.execute(db);
  },
};
