import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { FIVE_MINUTE_GRAIN, inRollupScope, sumOf } from '../common/rollups.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import {
  HTTP_CLASS,
  OUTBOUND_CLASSES,
  buildMap,
  type ExecutionLinks,
} from './map-graph.js';
import type { MapDto } from './map.dto.js';
import { MapRepository, type MapFilter } from './map.repository.js';

/** Latest requests and latest jobs of the window whose parent is looked up by trace id. */
export const MAP_LINK_SAMPLE = 5000;

/**
 * Reads the rollups for the nodes (`requests_1m`, `jobs_1m`, `span_stats_5m`) and one
 * bounded raw query for the trace-id links, all in parallel; `buildMap` puts them
 * together.
 */
@Injectable()
export class PostgresMapRepository extends MapRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async map({ scope, window }: MapFilter): Promise<MapDto> {
    if (scope.applicationIds.length === 0)
      return { nodes: [], edges: [], sampled: false };

    const [names, applications, queues, outbound, links] = await Promise.all([
      this.db
        .selectFrom('applications')
        .where(inApplications('id', scope.applicationIds))
        .select(['id', 'name'])
        .execute(),
      this.db
        .selectFrom('requests_1m')
        .where(inRollupScope(scope, window))
        .select([
          'application_id',
          sumOf('count').as('requests'),
          sumOf('errors').as('errors'),
          sumOf('sum_ms').as('sum_ms'),
        ])
        .groupBy('application_id')
        .execute(),
      this.db
        .selectFrom('jobs_1m')
        .where(inRollupScope(scope, window))
        .select([
          'application_id',
          'queue',
          sumOf('count').as('jobs'),
          sumOf('failed').as('failed'),
          sumOf('sum_ms').as('sum_ms'),
        ])
        .groupBy(['application_id', 'queue'])
        .execute(),
      this.outbound(scope, window),
      this.links(scope, window),
    ]);

    return buildMap({
      applicationNames: new Map(names.map((row) => [row.id, row.name])),
      applications: applications.map((row) => ({
        applicationId: row.application_id,
        requests: row.requests,
        errors: row.errors,
        sumMs: row.sum_ms,
      })),
      queues: queues.map((row) => ({
        applicationId: row.application_id,
        queue: row.queue,
        jobs: row.jobs,
        failed: row.failed,
        sumMs: row.sum_ms,
      })),
      outbound,
      links,
      sampleLimit: MAP_LINK_SAMPLE,
    });
  }

  /**
   * Outbound spans per application and driver; HTTP ones also per method name
   * (`<METHOD> <host>`), the only place the host is kept.
   */
  private async outbound(scope: TelemetryScope, window: TimeWindow) {
    // A literal, so the SELECT and GROUP BY expressions are identical.
    const target = sql<string>`case when class_name = ${sql.lit(HTTP_CLASS)} then method_name else '' end`;
    const rows = await this.db
      .selectFrom('span_stats_5m')
      .where(inRollupScope(scope, window, {}, FIVE_MINUTE_GRAIN))
      .where('class_name', 'in', OUTBOUND_CLASSES)
      .select([
        'application_id',
        'class_name',
        target.as('method_name'),
        sumOf('calls').as('calls'),
        sumOf('errors').as('errors'),
        sumOf('total_ms').as('total_ms'),
      ])
      .groupBy(['application_id', 'class_name', target])
      .execute();
    return rows.map((row) => ({
      applicationId: row.application_id,
      className: row.class_name,
      methodName: row.method_name,
      calls: row.calls,
      errors: row.errors,
      totalMs: row.total_ms,
    }));
  }

  /**
   * The latest requests and jobs of the window (index on `(called_at desc, id desc)` or
   * `(application_id, called_at desc, id desc)`), each with the execution that started
   * it: same trace id (trace id index, run-time pruned to the day before), another
   * execution (not a retry of the same job), started at or before the request, or
   * before the job was enqueued. One that was still running then wins, a request
   * before a job, then the latest. Grouped, so few rows come back.
   */
  private async links(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<ExecutionLinks[]> {
    const apps = (column: string): RawBuilder<SqlBool> =>
      inApplications(column, scope.applicationIds);
    const instance = (column: string): RawBuilder<SqlBool> =>
      scope.instance
        ? sql<SqlBool>`${sql.ref(column)} = ${scope.instance}`
        : sql<SqlBool>`true`;
    const { from, to } = window;

    const { rows } = await sql<{
      kind: 'request' | 'job';
      application_id: string;
      queue: string | null;
      parent_application_id: string | null;
      count: number;
      errors: number;
    }>`
      with sample as (
        (
          select 'request'::text as kind, r.id, r.application_id, null::text as queue,
            null::text as job_id, r.trace_id, r.called_at as at, r.has_error
          from requests r
          where ${apps('r.application_id')} and ${instance('r.service_id')}
            and r.called_at >= ${from} and r.called_at < ${to}
          order by r.called_at desc, r.id desc
          limit ${MAP_LINK_SAMPLE}
        )
        union all
        (
          select 'job'::text, j.id, j.application_id, j.queue, j.job_id, j.trace_id,
            least(coalesce(j.enqueued_at, j.called_at), j.called_at), j.has_error
          from jobs j
          where ${apps('j.application_id')} and ${instance('j.service_id')}
            and j.called_at >= ${from} and j.called_at < ${to}
          order by j.called_at desc, j.id desc
          limit ${MAP_LINK_SAMPLE}
        )
      )
      select s.kind, s.application_id, s.queue,
        p.application_id as parent_application_id,
        count(*)::int8 as count,
        (count(*) filter (where s.has_error))::int8 as errors
      from sample s
      left join lateral (
        select c.application_id
        from (
          select r.application_id, r.called_at, r.duration_ms, true as is_request
          from requests r
          where r.trace_id = s.trace_id and r.id <> s.id
            and ${apps('r.application_id')}
            and r.called_at >= s.at - interval '1 day' and r.called_at <= s.at
          union all
          select j.application_id, j.called_at, j.duration_ms, false
          from jobs j
          where j.trace_id = s.trace_id and j.id <> s.id
            and (j.queue, j.job_id) is distinct from (s.queue, s.job_id)
            and ${apps('j.application_id')}
            and j.called_at >= s.at - interval '1 day' and j.called_at <= s.at
        ) c
        order by
          (c.called_at + c.duration_ms * interval '1 millisecond' >= s.at) desc,
          c.is_request desc,
          c.called_at desc
        limit 1
      ) p on true
      group by s.kind, s.application_id, s.queue, p.application_id
    `.execute(this.db);

    return rows.map((row) => ({
      kind: row.kind,
      applicationId: row.application_id,
      queue: row.queue,
      parentApplicationId: row.parent_application_id,
      count: row.count,
      errors: row.errors,
    }));
  }
}
