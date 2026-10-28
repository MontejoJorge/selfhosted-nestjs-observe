import type { ActivityBucket } from '@selfhosted-observe/contracts';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../database/database.types.js';
import { inApplications } from '../telemetry/common/scope.js';
import { bucketStart, countAll, countWhere } from '../telemetry/common/sql.js';
import {
  BUCKET_ORIGIN,
  bucketSeconds,
  type TimeWindow,
} from '../telemetry/common/time-window.js';

/** Request activity of one group (a project or an application) over a window. */
export interface ActivityStats {
  requestCount: number;
  errorCount: number;
  avgDurationMs: number | null;
  activity: ActivityBucket[];
}

interface BucketRow {
  t: Date;
  count: number;
  errors: number;
  sum_ms: number | null;
}

/**
 * Request buckets for a set of applications, merged per `key` (a project or the
 * application itself): one aggregate query for a whole page of cards. The scan is one
 * range of the (application_id, called_at) index per application and pruned partition.
 */
export async function requestActivity(
  db: Kysely<Database>,
  window: TimeWindow,
  applications: ReadonlyArray<{ id: string; key: string }>,
): Promise<Map<string, ActivityStats>> {
  const step = bucketSeconds(window);
  const keyOf = new Map(applications.map((app) => [app.id, app.key]));
  const byKey = new Map<string, Map<number, BucketRow>>();
  for (const app of applications) byKey.set(app.key, new Map());

  if (applications.length > 0) {
    const t = bucketStart('called_at', step);
    const rows = await db
      .selectFrom('requests')
      .select([
        'application_id',
        t.as('t'),
        countAll.as('count'),
        countWhere('has_error').as('errors'),
        sql<number | null>`sum(duration_ms)::float8`.as('sum_ms'),
      ])
      .where(
        inApplications(
          'application_id',
          applications.map((app) => app.id),
        ),
      )
      .where('called_at', '>=', window.from)
      .where('called_at', '<', window.to)
      .groupBy(['application_id', t])
      .execute();
    for (const row of rows) {
      const buckets = byKey.get(keyOf.get(row.application_id) ?? '');
      if (!buckets) continue;
      const start = row.t.getTime();
      const bucket = buckets.get(start);
      if (bucket) {
        bucket.count += row.count;
        bucket.errors += row.errors;
        bucket.sum_ms = (bucket.sum_ms ?? 0) + (row.sum_ms ?? 0);
      } else {
        buckets.set(start, { ...row });
      }
    }
  }

  const result = new Map<string, ActivityStats>();
  for (const [key, buckets] of byKey)
    result.set(key, summarize(window, step, buckets));
  return result;
}

function summarize(
  window: TimeWindow,
  stepSeconds: number,
  byStart: Map<number, BucketRow>,
): ActivityStats {
  const stepMs = stepSeconds * 1000;
  const origin = Date.parse(BUCKET_ORIGIN);
  const activity: ActivityBucket[] = [];
  let requestCount = 0;
  let errorCount = 0;
  let totalMs = 0;
  const first =
    origin + Math.floor((window.from.getTime() - origin) / stepMs) * stepMs;
  for (let start = first; start < window.to.getTime(); start += stepMs) {
    const row = byStart.get(start);
    const count = row?.count ?? 0;
    const sumMs = row?.sum_ms ?? 0;
    requestCount += count;
    errorCount += row?.errors ?? 0;
    totalMs += sumMs;
    activity.push({
      t: new Date(start).toISOString(),
      count,
      errors: row?.errors ?? 0,
      avgDurationMs: count > 0 ? sumMs / count : null,
    });
  }
  return {
    requestCount,
    errorCount,
    avgDurationMs: requestCount > 0 ? totalMs / requestCount : null,
    activity,
  };
}

/** Stats for a group without applications (all buckets empty). */
export function emptyActivity(window: TimeWindow): ActivityStats {
  return summarize(window, bucketSeconds(window), new Map());
}
