import { sql, type Kysely } from 'kysely';

/**
 * Per-minute rollups of requests and jobs, so overviews, operation and queue stats and
 * timelines read thousands of rows instead of millions.
 *
 * One row per application, minute, instance and operation (or queue and job) with
 * counts, duration sum/min/max and a log-scale latency histogram (int4[], see
 * `ingest/domain/latency-histogram.ts`) to read percentiles back. Ingest upserts them;
 * `histogram_add` merges two histograms element-wise. They are day-partitioned like the
 * raw tables but kept for AGGREGATE_RETENTION_DAYS.
 *
 * Existing telemetry is backfilled one day partition at a time.
 */
const MINUTE_ROLLUPS = ['requests_1m', 'jobs_1m'];

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
  for (const table of MINUTE_ROLLUPS) {
    await sql
      .raw(
        `create table if not exists ${table}_p${suffix} partition of ${table} ` +
          `for values from ('${from}') to ('${to}')`,
      )
      .execute(db);
  }

  await sql`
    insert into requests_1m (
      application_id, minute, service_id, operation_id, protocol, method, count, errors,
      status_4xx, status_5xx, sum_ms, min_ms, max_ms, histogram, last_called_at
    )
    select application_id, minute, service_id, operation_id, protocol, method, n, errors,
      status_4xx, status_5xx, sum_ms, min_ms, max_ms, ${DENSE_HISTOGRAM}, last_called_at
    from (
      select application_id, minute, service_id, operation_id, protocol, method,
        array_agg(bucket) as buckets, array_agg(n) as counts, sum(n) as n, sum(errors) as errors,
        sum(status_4xx) as status_4xx, sum(status_5xx) as status_5xx, sum(sum_ms) as sum_ms,
        min(min_ms) as min_ms, max(max_ms) as max_ms, max(last_called_at) as last_called_at
      from (
        select application_id, date_trunc('minute', called_at) as minute, service_id, operation_id,
          protocol, coalesce(method, '') as method, ${BUCKET} as bucket,
          count(*)::int4 as n,
          count(*) filter (where has_error) as errors,
          count(*) filter (where status_code between 400 and 499) as status_4xx,
          count(*) filter (where status_code >= 500) as status_5xx,
          sum(duration_ms) as sum_ms, min(duration_ms) as min_ms, max(duration_ms) as max_ms,
          max(called_at) as last_called_at
        from requests
        where called_at >= ${from}::timestamptz and called_at < ${to}::timestamptz
        group by 1, 2, 3, 4, 5, 6, 7
      ) per_bucket
      group by 1, 2, 3, 4, 5, 6
    ) per_minute
  `.execute(db);

  await sql`
    insert into jobs_1m (
      application_id, minute, service_id, queue, name, count, failed, sum_ms, min_ms, max_ms,
      histogram, wait_sum_ms, wait_count, last_called_at
    )
    select application_id, minute, service_id, queue, name, n, failed, sum_ms, min_ms, max_ms,
      ${DENSE_HISTOGRAM}, wait_sum_ms, wait_count, last_called_at
    from (
      select application_id, minute, service_id, queue, name,
        array_agg(bucket) as buckets, array_agg(n) as counts, sum(n) as n, sum(failed) as failed,
        sum(sum_ms) as sum_ms, min(min_ms) as min_ms, max(max_ms) as max_ms,
        sum(wait_sum_ms) as wait_sum_ms, sum(wait_count) as wait_count,
        max(last_called_at) as last_called_at
      from (
        select application_id, date_trunc('minute', called_at) as minute, service_id, queue, name,
          ${BUCKET} as bucket,
          count(*)::int4 as n,
          count(*) filter (where has_error) as failed,
          sum(duration_ms) as sum_ms, min(duration_ms) as min_ms, max(duration_ms) as max_ms,
          coalesce(sum(wait_ms), 0) as wait_sum_ms, count(wait_ms) as wait_count,
          max(called_at) as last_called_at
        from jobs
        where called_at >= ${from}::timestamptz and called_at < ${to}::timestamptz
        group by 1, 2, 3, 4, 5, 6
      ) per_bucket
      group by 1, 2, 3, 4, 5
    ) per_minute
  `.execute(db);
}

export const minuteRollups = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create function histogram_add(a int4[], b int4[]) returns int4[]
      language sql immutable parallel safe
      return (
        select array_agg(coalesce(x, 0) + coalesce(y, 0) order by i)
        from unnest(a, b) with ordinality as u(x, y, i)
      )
    `.execute(db);

    await sql`
      create table requests_1m (
        application_id uuid not null,
        minute timestamptz not null,
        service_id text not null,
        operation_id text not null,
        protocol text not null,
        method text not null,
        count int4 not null,
        errors int4 not null,
        status_4xx int4 not null,
        status_5xx int4 not null,
        sum_ms double precision not null,
        min_ms double precision not null,
        max_ms double precision not null,
        histogram int4[] not null,
        last_called_at timestamptz not null,
        primary key (application_id, minute, service_id, operation_id, protocol, method)
      ) partition by range (minute)
    `.execute(db);

    await sql`
      create table jobs_1m (
        application_id uuid not null,
        minute timestamptz not null,
        service_id text not null,
        queue text not null,
        name text not null,
        count int4 not null,
        failed int4 not null,
        sum_ms double precision not null,
        min_ms double precision not null,
        max_ms double precision not null,
        histogram int4[] not null,
        wait_sum_ms double precision not null,
        wait_count int4 not null,
        last_called_at timestamptz not null,
        primary key (application_id, minute, service_id, queue, name)
      ) partition by range (minute)
    `.execute(db);

    const days = new Set([
      ...(await partitionDays(db, 'requests')),
      ...(await partitionDays(db, 'jobs')),
    ]);
    for (const day of [...days].sort()) await backfillDay(db, day);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists jobs_1m`.execute(db);
    await sql`drop table if exists requests_1m`.execute(db);
    await sql`drop function if exists histogram_add(int4[], int4[])`.execute(
      db,
    );
  },
};
