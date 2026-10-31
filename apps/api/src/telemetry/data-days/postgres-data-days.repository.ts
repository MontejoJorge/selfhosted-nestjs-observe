import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import { DataDaysRepository } from './data-days.repository.js';

@Injectable()
export class PostgresDataDaysRepository extends DataDaysRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /**
   * Two sources, one statement:
   * - `application_usage` (rows per application, day and raw table, counted at ingest):
   *   a range of its primary key per application. It covers the raw retention window.
   * - For the other days (rollups outlive raw rows, and trims delete usage rows), one
   *   existence probe per day on `requests_1m` and `jobs_1m`: a correlated `exists` whose
   *   bounds come from the day, so run-time pruning opens one partition and the primary
   *   key `(application_id, minute, ...)` stops at the first row.
   */
  async list(scope: TelemetryScope, window: TimeWindow): Promise<string[]> {
    const ids = scope.applicationIds;
    if (ids.length === 0) return [];
    const fromDay = window.from.toISOString().slice(0, 10);
    const lastDay = new Date(window.to.getTime() - 1)
      .toISOString()
      .slice(0, 10);

    const { rows } = await sql<{ day: string }>`
      with usage_days as (
        select distinct day
        from application_usage
        where ${inApplications('application_id', ids)}
          and day >= ${fromDay}::date and day <= ${lastDay}::date
          and rows > 0
      ),
      -- Materialized so the days already known are removed before any probe runs.
      unknown_days as materialized (
        select d
        from generate_series(
          ${window.from}::timestamptz,
          ${window.to}::timestamptz - interval '1 microsecond',
          interval '24 hours'
        ) d
        where not exists (
          select 1 from usage_days u where u.day = (d at time zone 'UTC')::date
        )
      ),
      probed as (
        select (d at time zone 'UTC')::date as day
        from unknown_days
        where (
            exists (
              select 1 from requests_1m r
              where ${inApplications('r.application_id', ids)}
                and r.minute >= d and r.minute < d + interval '24 hours'
            )
            or exists (
              select 1 from jobs_1m j
              where ${inApplications('j.application_id', ids)}
                and j.minute >= d and j.minute < d + interval '24 hours'
            )
          )
      )
      select to_char(day, 'YYYY-MM-DD') as day from usage_days
      union all
      select to_char(day, 'YYYY-MM-DD') as day from probed
      order by day
    `.execute(this.db);
    return rows.map((row) => row.day);
  }
}
