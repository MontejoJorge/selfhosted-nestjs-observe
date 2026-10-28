import { Inject, Injectable } from '@nestjs/common';
import type { Overview } from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { inApplications } from '../common/scope.js';
import {
  avgOf,
  bucketStart,
  count4xx,
  count5xx,
  countAll,
  countWhere,
  latencyPercentiles,
  p95,
  ratio,
  toPercentiles,
} from '../common/sql.js';
import { bucketSeconds, fillTimeline } from '../common/time-window.js';
import {
  OverviewRepository,
  type OverviewFilter,
} from './overview.repository.js';

/**
 * Independent aggregates over the pruned window, run in parallel on separate pool
 * connections: request and job totals, error counts, and one timeline each for
 * requests and jobs.
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
  }: OverviewFilter): Promise<Overview> {
    const apps = inApplications('application_id', scope.applicationIds);
    const instance = scope.instance;

    const requestsInWindow = () => {
      let q = this.db
        .selectFrom('requests')
        .where(apps)
        .where('called_at', '>=', window.from)
        .where('called_at', '<', window.to);
      if (instance) q = q.where('service_id', '=', instance);
      if (operationId) q = q.where('operation_id', '=', operationId);
      return q;
    };

    const jobsInWindow = () => {
      let q = this.db
        .selectFrom('jobs')
        .where(apps)
        .where('called_at', '>=', window.from)
        .where('called_at', '<', window.to);
      if (instance) q = q.where('service_id', '=', instance);
      if (queue) q = q.where('queue', '=', queue);
      if (name) q = q.where('name', '=', name);
      return q;
    };

    // Distinct groups and events from the occurrences in the window, so the instance
    // filter is exact. Uses the (application_id, occurred_at) index.
    let occurrences = this.db
      .selectFrom('error_occurrences')
      .where(inApplications('application_id', scope.applicationIds))
      .where('occurred_at', '>=', window.from)
      .where('occurred_at', '<', window.to);
    if (instance) occurrences = occurrences.where('service_id', '=', instance);

    const step = bucketSeconds(window);
    const t = bucketStart('called_at', step);

    const [requestStats, jobStats, errorCounts, timeline, jobsTimeline] =
      await Promise.all([
        requestsInWindow()
          .select([
            countAll.as('count'),
            countWhere('has_error').as('errors'),
            count4xx.as('status4xx'),
            count5xx.as('status5xx'),
            latencyPercentiles('duration_ms').as('latency'),
            avgOf('duration_ms').as('avg'),
          ])
          .executeTakeFirstOrThrow(),
        jobsInWindow()
          .select([
            countAll.as('count'),
            countWhere('has_error').as('failed'),
            latencyPercentiles('duration_ms').as('latency'),
            avgOf('duration_ms').as('avg'),
          ])
          .executeTakeFirstOrThrow(),
        occurrences
          .select((eb) => [
            countAll.as('events'),
            eb.fn.count<number>('group_id').distinct().as('groups'),
          ])
          .executeTakeFirstOrThrow(),
        requestsInWindow()
          .select([
            t.as('t'),
            countAll.as('count'),
            countWhere('has_error').as('errors'),
            count4xx.as('status4xx'),
            count5xx.as('status5xx'),
            p95('duration_ms').as('p95'),
            avgOf('duration_ms').as('avg'),
          ])
          .groupBy(t)
          .orderBy(t)
          .execute(),
        jobsInWindow()
          .select([
            t.as('t'),
            countAll.as('count'),
            countWhere('has_error').as('errors'),
            p95('duration_ms').as('p95'),
            avgOf('duration_ms').as('avg'),
          ])
          .groupBy(t)
          .orderBy(t)
          .execute(),
      ]);

    return {
      requests: {
        count: requestStats.count,
        errorRate: ratio(requestStats.errors, requestStats.count),
        latency: toPercentiles(requestStats.latency, requestStats.avg),
        status4xx: requestStats.status4xx,
        status5xx: requestStats.status5xx,
      },
      jobs: {
        count: jobStats.count,
        failed: jobStats.failed,
        failureRate: ratio(jobStats.failed, jobStats.count),
        latency: toPercentiles(jobStats.latency, jobStats.avg),
      },
      errors: { groups: errorCounts.groups, events: errorCounts.events },
      timeline: fillTimeline(window, step, timeline),
      jobsTimeline: fillTimeline(window, step, jobsTimeline),
    };
  }
}
