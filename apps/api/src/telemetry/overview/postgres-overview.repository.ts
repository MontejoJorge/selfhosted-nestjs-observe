import { Inject, Injectable } from '@nestjs/common';
import type { Overview } from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
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
    window,
    serviceId,
    operationId,
    queue,
    name,
  }: OverviewFilter): Promise<Overview> {
    const requestsInWindow = () => {
      let q = this.db
        .selectFrom('requests')
        .where('called_at', '>=', window.from)
        .where('called_at', '<', window.to);
      if (serviceId) q = q.where('service_id', '=', serviceId);
      if (operationId) q = q.where('operation_id', '=', operationId);
      return q;
    };

    const jobsInWindow = () => {
      let q = this.db
        .selectFrom('jobs')
        .where('called_at', '>=', window.from)
        .where('called_at', '<', window.to);
      if (serviceId) q = q.where('service_id', '=', serviceId);
      if (queue) q = q.where('queue', '=', queue);
      if (name) q = q.where('name', '=', name);
      return q;
    };

    let groups = this.db
      .selectFrom('error_groups')
      .where('last_seen_at', '>=', window.from)
      .where('first_seen_at', '<', window.to);
    if (serviceId) groups = groups.where('service_id', '=', serviceId);

    let occurrences = this.db
      .selectFrom('error_occurrences')
      .where('occurred_at', '>=', window.from)
      .where('occurred_at', '<', window.to);
    if (serviceId)
      occurrences = occurrences.where('service_id', '=', serviceId);

    const step = bucketSeconds(window);
    const t = bucketStart('called_at', step);

    const [
      requestStats,
      jobStats,
      groupCount,
      eventCount,
      timeline,
      jobsTimeline,
    ] = await Promise.all([
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
      groups.select(countAll.as('count')).executeTakeFirstOrThrow(),
      occurrences.select(countAll.as('count')).executeTakeFirstOrThrow(),
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
        failureRate: ratio(jobStats.failed, jobStats.count),
        latency: toPercentiles(jobStats.latency, jobStats.avg),
      },
      errors: { groups: groupCount.count, events: eventCount.count },
      timeline: fillTimeline(window, step, timeline),
      jobsTimeline: fillTimeline(window, step, jobsTimeline),
    };
  }
}
