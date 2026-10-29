import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  cellBucket,
  cellCount,
  histogramCells,
  inRollupScope,
  maxOf,
  minOf,
  nonEmptyCell,
  sumOf,
  summarizeTimeline,
} from '../common/rollups.js';
import { inApplications } from '../common/scope.js';
import { bucketStart, countAll, ratio } from '../common/sql.js';
import { bucketSeconds, fillTimeline } from '../common/time-window.js';
import type { OverviewDto } from './overview.dto.js';
import {
  OverviewRepository,
  type OverviewFilter,
} from './overview.repository.js';

/**
 * Reads the per-minute rollups: for requests and for jobs, one grouped query for the
 * timeline and one for the histogram cells of its buckets; the totals are the sum of the
 * buckets. Error counts come from `error_occurrences`. All run in parallel.
 */
@Injectable()
export class PostgresOverviewRepository extends OverviewRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async get({
    scope,
    window,
    operationId,
    queue,
    name,
  }: OverviewFilter): Promise<OverviewDto> {
    const instance = scope.instance;
    const requestsFilter = inRollupScope(scope, window, {
      operation_id: operationId,
    });
    const jobsFilter = inRollupScope(scope, window, { queue, name });
    const requests = () =>
      this.db.selectFrom('requests_1m').where(requestsFilter);
    const requestCells = () =>
      this.db
        .selectFrom(['requests_1m', histogramCells])
        .where(requestsFilter)
        .where(nonEmptyCell);
    const jobs = () => this.db.selectFrom('jobs_1m').where(jobsFilter);
    const jobCells = () =>
      this.db
        .selectFrom(['jobs_1m', histogramCells])
        .where(jobsFilter)
        .where(nonEmptyCell);

    // Distinct groups and events from the occurrences in the window, so the instance
    // filter is exact. Uses the (application_id, occurred_at) index.
    let occurrences = this.db
      .selectFrom('error_occurrences')
      .where(inApplications('application_id', scope.applicationIds))
      .where('occurred_at', '>=', window.from)
      .where('occurred_at', '<', window.to);
    if (instance) occurrences = occurrences.where('service_id', '=', instance);

    const step = bucketSeconds(window);
    const t = bucketStart('minute', step);

    const [requestRows, requestCellRows, jobRows, jobCellRows, errorCounts] =
      await Promise.all([
        requests()
          .select([
            t.as('t'),
            sumOf('count').as('count'),
            sumOf('errors').as('errors'),
            sumOf('status_4xx').as('status4xx'),
            sumOf('status_5xx').as('status5xx'),
            sumOf('sum_ms').as('sum_ms'),
            minOf.as('min_ms'),
            maxOf.as('max_ms'),
          ])
          .groupBy(t)
          .execute(),
        requestCells()
          .select([t.as('t'), cellBucket.as('bucket'), cellCount.as('count')])
          .groupBy([t, cellBucket])
          .execute(),
        jobs()
          .select([
            t.as('t'),
            sumOf('count').as('count'),
            sumOf('failed').as('errors'),
            sumOf('sum_ms').as('sum_ms'),
            minOf.as('min_ms'),
            maxOf.as('max_ms'),
          ])
          .groupBy(t)
          .execute(),
        jobCells()
          .select([t.as('t'), cellBucket.as('bucket'), cellCount.as('count')])
          .groupBy([t, cellBucket])
          .execute(),
        occurrences
          .select((eb) => [
            countAll.as('events'),
            eb.fn.count<number>('group_id').distinct().as('groups'),
          ])
          .executeTakeFirstOrThrow(),
      ]);

    const requestStats = summarizeTimeline(requestRows, requestCellRows);
    const jobStats = summarizeTimeline(jobRows, jobCellRows);

    return {
      requests: {
        count: requestStats.totals.count,
        errorRate: ratio(requestStats.totals.errors, requestStats.totals.count),
        latency: requestStats.latency,
        status4xx: requestStats.totals.status4xx,
        status5xx: requestStats.totals.status5xx,
      },
      jobs: {
        count: jobStats.totals.count,
        failed: jobStats.totals.errors,
        failureRate: ratio(jobStats.totals.errors, jobStats.totals.count),
        latency: jobStats.latency,
      },
      errors: { groups: errorCounts.groups, events: errorCounts.events },
      timeline: fillTimeline(window, step, requestStats.buckets),
      jobsTimeline: fillTimeline(window, step, jobStats.buckets),
    };
  }
}
