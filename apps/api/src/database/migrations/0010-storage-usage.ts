import { sql, type Kysely } from 'kysely';

/**
 * Storage usage and trims (ADR 0005).
 *
 * - `application_usage`: rows and estimated payload bytes per application, UTC day and raw
 *   table, upserted at ingest. PostgreSQL has no per-application size of a shared day
 *   partition, so the API apportions each partition's real size by these bytes.
 * - `storage_trims`: pending "delete data older than N days" requests for a project or one
 *   application, processed in the background by `StorageTrimmer`. One row per target
 *   (`nulls not distinct`, so one project-wide row per project); a new request for the
 *   same target replaces the pending one.
 *
 * Backfill: one pass over every partition of the raw tables, counting rows and summing
 * `pg_column_size` of each column (plus a 24-byte tuple header) per application. Per
 * column, `pg_column_size` reads the stored (possibly compressed or TOASTed) size without
 * fetching TOAST data; `pg_column_size(t.*)` would detoast every large value.
 */
const PARTITIONED = [
  'requests',
  'jobs',
  'error_occurrences',
  'logs',
  'runtime_metrics',
  'custom_metrics',
];

const PARTITION_SUFFIX = /_p(\d{4})(\d{2})(\d{2})$/;

async function columnsOf(
  db: Kysely<unknown>,
  table: string,
): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`
    select attname as name
    from pg_attribute
    where attrelid = ${table}::regclass and attnum > 0 and not attisdropped
    order by attnum
  `.execute(db);
  return rows.map((row) => row.name);
}

/** `24 + coalesce(pg_column_size("a"), 0) + ...`: the same estimate as ingest. */
function bytesExpression(columns: string[]): string {
  return [
    '24',
    ...columns.map((column) => `coalesce(pg_column_size("${column}"), 0)`),
  ].join(' + ');
}

async function partitionsOf(
  db: Kysely<unknown>,
  table: string,
): Promise<{ name: string; day: string }[]> {
  const { rows } = await sql<{ child: string }>`
    select child.relname as child
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    join pg_namespace ns on ns.oid = child.relnamespace
    where ns.nspname = current_schema() and parent.relname = ${table}
    order by child.relname
  `.execute(db);
  return rows.flatMap(({ child }) => {
    const match = PARTITION_SUFFIX.exec(child);
    return match
      ? [{ name: child, day: `${match[1]}-${match[2]}-${match[3]}` }]
      : [];
  });
}

export const storageUsage = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table application_usage (
        application_id uuid not null,
        day date not null,
        table_name text not null,
        rows bigint not null,
        bytes bigint not null,
        primary key (application_id, day, table_name)
      )
    `.execute(db);
    // Retention deletes the usage of expired days across every application.
    await sql`create index application_usage_day_idx on application_usage (day)`.execute(
      db,
    );

    await sql`
      create table storage_trims (
        id uuid primary key default uuidv7(),
        project_id uuid not null references projects (id) on delete cascade,
        application_id uuid,
        keep_days integer not null check (keep_days >= 1),
        cutoff_day date not null,
        requested_at timestamptz not null default now(),
        started_at timestamptz,
        done_steps integer not null default 0,
        total_steps integer,
        unique nulls not distinct (project_id, application_id),
        foreign key (application_id, project_id)
          references applications (id, project_id) on delete cascade
      )
    `.execute(db);

    for (const table of PARTITIONED) {
      const bytes = bytesExpression(await columnsOf(db, table));
      for (const partition of await partitionsOf(db, table)) {
        await sql
          .raw(
            `insert into application_usage (application_id, day, table_name, rows, bytes)
             select application_id, '${partition.day}'::date, '${table}', count(*), sum(${bytes})
             from ${partition.name}
             group by application_id`,
          )
          .execute(db);
      }
    }

    const profileBytes = bytesExpression(await columnsOf(db, 'profiles'));
    await sql
      .raw(
        `insert into application_usage (application_id, day, table_name, rows, bytes)
         select application_id, (received_at at time zone 'UTC')::date, 'profiles', count(*),
           sum(${profileBytes})
         from profiles
         group by 1, 2`,
      )
      .execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists storage_trims`.execute(db);
    await sql`drop table if exists application_usage`.execute(db);
  },
};
