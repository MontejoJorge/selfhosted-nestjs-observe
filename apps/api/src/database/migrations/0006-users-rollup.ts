import { sql, type Kysely } from 'kysely';

/**
 * Hourly rollup of the requests that carry a user id (ADR 0004), and an index for the
 * `userId` filter on the request list.
 *
 * `users_1h` has one row per application, UTC hour and user, with counts, duration
 * sum/min/max, the latency histogram of ADR 0003 and the first and last request time.
 * It is day-partitioned and kept for AGGREGATE_RETENTION_DAYS. Existing requests are
 * backfilled one day partition at a time.
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
  await sql
    .raw(
      `create table if not exists users_1h_p${day.replaceAll('-', '')} partition of users_1h ` +
        `for values from ('${from}') to ('${to}')`,
    )
    .execute(db);

  await sql`
    insert into users_1h (
      application_id, hour, user_id, count, errors, status_4xx, status_5xx, sum_ms, min_ms,
      max_ms, histogram, first_called_at, last_called_at
    )
    select application_id, hour, user_id, n, errors, status_4xx, status_5xx, sum_ms, min_ms,
      max_ms, ${DENSE_HISTOGRAM}, first_called_at, last_called_at
    from (
      select application_id, hour, user_id,
        array_agg(bucket) as buckets, array_agg(n) as counts, sum(n) as n, sum(errors) as errors,
        sum(status_4xx) as status_4xx, sum(status_5xx) as status_5xx, sum(sum_ms) as sum_ms,
        min(min_ms) as min_ms, max(max_ms) as max_ms,
        min(first_called_at) as first_called_at, max(last_called_at) as last_called_at
      from (
        select application_id, date_trunc('hour', called_at) as hour, user_id,
          ${BUCKET} as bucket,
          count(*)::int4 as n,
          count(*) filter (where has_error) as errors,
          count(*) filter (where status_code between 400 and 499) as status_4xx,
          count(*) filter (where status_code >= 500) as status_5xx,
          sum(duration_ms) as sum_ms, min(duration_ms) as min_ms, max(duration_ms) as max_ms,
          min(called_at) as first_called_at, max(called_at) as last_called_at
        from requests
        where called_at >= ${from}::timestamptz and called_at < ${to}::timestamptz
          and user_id is not null
        group by 1, 2, 3, 4
      ) per_bucket
      group by 1, 2, 3
    ) per_hour
  `.execute(db);
}

export const usersRollup = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table users_1h (
        application_id uuid not null,
        hour timestamptz not null,
        user_id text not null,
        count int4 not null,
        errors int4 not null,
        status_4xx int4 not null,
        status_5xx int4 not null,
        sum_ms double precision not null,
        min_ms double precision not null,
        max_ms double precision not null,
        histogram int4[] not null,
        first_called_at timestamptz not null,
        last_called_at timestamptz not null,
        primary key (application_id, hour, user_id)
      ) partition by range (hour)
    `.execute(db);

    for (const day of (await partitionDays(db, 'requests')).sort())
      await backfillDay(db, day);

    // The `userId` filter of the request list: one index range per partition, in keyset order.
    await sql`
      create index requests_app_user_called_at_idx
      on requests (application_id, user_id, called_at desc, id desc)
      where user_id is not null
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop index if exists requests_app_user_called_at_idx`.execute(db);
    await sql`drop table if exists users_1h`.execute(db);
  },
};
