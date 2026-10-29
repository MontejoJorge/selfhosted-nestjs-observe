import { sql, type Kysely } from 'kysely';

/**
 * Users page activity (ADR 0004):
 *
 * - `users_1h` also gets the requests without a user id, under `user_id = ''`, so the
 *   users list can show an anonymous row. Rows with `''` are rebuilt from `requests`.
 * - `user_presence_15m`: one row per application, 15-minute bucket and identified user,
 *   to count distinct users per bucket in the 24h activity chart (distinct counts cannot
 *   be summed across buckets). Day-partitioned, kept for AGGREGATE_RETENTION_DAYS,
 *   backfilled from `requests`.
 */
const PARTITION_SUFFIX = /_p(\d{4})(\d{2})(\d{2})$/;

/** Same index as `bucketIndex` in `ingest/domain/latency-histogram.ts`. */
const BUCKET = sql`case when duration_ms < 1 then 0 else least(floor(4 * ln(duration_ms) / ln(2))::int + 1, 96) end`;

/** Dense histogram from the `buckets` and `counts` arrays of a grouped row. */
const DENSE_HISTOGRAM = sql`(
  select array_agg(coalesce(c.n, 0)::int4 order by g.i)
  from generate_series(0, (select max(b) from unnest(buckets) b)) g(i)
  left join unnest(buckets, counts) c(b, n) on c.b = g.i
)`;

async function partitionDays(
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
  `.execute(db);
  return rows
    .map((row) => PARTITION_SUFFIX.exec(row.child))
    .filter((match) => match !== null)
    .map((match) => `${match[1]}-${match[2]}-${match[3]}`);
}

async function backfillDay(db: Kysely<unknown>, day: string): Promise<void> {
  const from = `${day} 00:00:00+00`;
  const to = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .replace('T', ' ')
    .replace('.000Z', '+00');
  const suffix = day.replaceAll('-', '');
  for (const table of ['users_1h', 'user_presence_15m'])
    await sql
      .raw(
        `create table if not exists ${table}_p${suffix} partition of ${table} ` +
          `for values from ('${from}') to ('${to}')`,
      )
      .execute(db);

  await sql`
    insert into user_presence_15m (application_id, bucket, user_id)
    select distinct application_id,
      date_bin('15 minutes', called_at, '2000-01-01 00:00:00+00'), user_id
    from requests
    where called_at >= ${from}::timestamptz and called_at < ${to}::timestamptz
      and user_id is not null
  `.execute(db);

  await sql`
    insert into users_1h (
      application_id, hour, user_id, count, errors, status_4xx, status_5xx, sum_ms, min_ms,
      max_ms, histogram, first_called_at, last_called_at
    )
    select application_id, hour, '', n, errors, status_4xx, status_5xx, sum_ms, min_ms,
      max_ms, ${DENSE_HISTOGRAM}, first_called_at, last_called_at
    from (
      select application_id, hour,
        array_agg(bucket) as buckets, array_agg(n) as counts, sum(n) as n, sum(errors) as errors,
        sum(status_4xx) as status_4xx, sum(status_5xx) as status_5xx, sum(sum_ms) as sum_ms,
        min(min_ms) as min_ms, max(max_ms) as max_ms,
        min(first_called_at) as first_called_at, max(last_called_at) as last_called_at
      from (
        select application_id, date_trunc('hour', called_at) as hour, ${BUCKET} as bucket,
          count(*)::int4 as n,
          count(*) filter (where has_error) as errors,
          count(*) filter (where status_code between 400 and 499) as status_4xx,
          count(*) filter (where status_code >= 500) as status_5xx,
          sum(duration_ms) as sum_ms, min(duration_ms) as min_ms, max(duration_ms) as max_ms,
          min(called_at) as first_called_at, max(called_at) as last_called_at
        from requests
        where called_at >= ${from}::timestamptz and called_at < ${to}::timestamptz
          and user_id is null
        group by 1, 2, 3
      ) per_bucket
      group by 1, 2
    ) per_hour
  `.execute(db);
}

export const userActivity = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table user_presence_15m (
        application_id uuid not null,
        bucket timestamptz not null,
        user_id text not null,
        primary key (application_id, bucket, user_id)
      ) partition by range (bucket)
    `.execute(db);

    // Anonymous rows written by an ingest that ran before this migration are rebuilt.
    await sql`delete from users_1h where user_id = ''`.execute(db);
    for (const day of (await partitionDays(db, 'requests')).sort())
      await backfillDay(db, day);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists user_presence_15m`.execute(db);
    await sql`delete from users_1h where user_id = ''`.execute(db);
  },
};
