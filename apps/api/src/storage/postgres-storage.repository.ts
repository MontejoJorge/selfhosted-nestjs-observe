import { Inject, Injectable } from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import {
  KYSELY,
  PARTITIONED_TABLES,
  ROLLUP_TABLES,
  USAGE_TABLES,
  type Db,
  type StorageTrimsTable,
} from '../database/database.types.js';
import { partitionDay } from '../database/partition-manager.js';
import type { DayTotal, RelationSize, UsageCell } from './domain/apportion.js';
import type { StorageTableKind } from './storage.dto.js';
import {
  StorageRepository,
  StorageTrimQueue,
  type ApplicationRef,
  type PartitionSize,
  type ProjectRef,
  type StorageTrim,
  type TableSize,
  type TrimRequest,
} from './storage.repository.js';

const ROLLUPS = new Set<string>(ROLLUP_TABLES);
const RAW = new Set<string>([
  ...Object.keys(PARTITIONED_TABLES),
  ...Object.keys(USAGE_TABLES),
]);
const USAGE = new Set<string>(Object.keys(USAGE_TABLES));
const PARTITIONED = new Set<string>(Object.keys(PARTITIONED_TABLES));

function kindOf(table: string): StorageTableKind {
  if (ROLLUPS.has(table)) return 'rollup';
  return RAW.has(table) ? 'raw' : 'other';
}

function toTrim(row: Selectable<StorageTrimsTable>): StorageTrim {
  return {
    id: row.id,
    projectId: row.project_id,
    applicationId: row.application_id,
    keepDays: row.keep_days,
    cutoffDay: row.cutoff_day,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    doneSteps: row.done_steps,
    totalSteps: row.total_steps,
  };
}

/**
 * Sizes come from the catalog (`pg_total_relation_size`, `reltuples`): no table scan.
 * Usage counters are a small table (applications x days x raw tables), read through its
 * primary key for one project's applications.
 */
@Injectable()
export class PostgresStorageRepository extends StorageRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async databaseSize(): Promise<number> {
    const { rows } = await sql<{
      bytes: number;
    }>`select pg_database_size(current_database()) as bytes`.execute(this.db);
    return rows[0].bytes;
  }

  async tableSizes(): Promise<TableSize[]> {
    const { rows } = await sql<{
      table: string;
      bytes: number;
      approx_rows: number | null;
      partitions: number;
    }>`
      select c.relname as "table",
        case when c.relkind = 'p' then coalesce(p.bytes, 0)
          else pg_total_relation_size(c.oid) end as bytes,
        case when c.relkind = 'p' then p.approx_rows
          else nullif(c.reltuples, -1)::float8 end as approx_rows,
        coalesce(p.partitions, 0) as partitions
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      left join lateral (
        select sum(pg_total_relation_size(t.relid)) as bytes, count(*) as partitions,
          sum(k.reltuples::float8) filter (where k.reltuples >= 0) as approx_rows
        from pg_partition_tree(c.oid) t
        join pg_class k on k.oid = t.relid
        where t.isleaf
      ) p on c.relkind = 'p'
      where ns.nspname = current_schema() and c.relkind in ('r', 'p') and not c.relispartition
      order by 2 desc, 1
    `.execute(this.db);
    return rows.map((row) => ({
      table: row.table,
      kind: kindOf(row.table),
      bytes: row.bytes,
      approxRows: row.approx_rows === null ? null : Math.round(row.approx_rows),
      partitions: row.partitions,
    }));
  }

  async partitionSizes(): Promise<PartitionSize[]> {
    const { rows } = await sql<{
      table: string;
      partition: string;
      bytes: number;
      approx_rows: number | null;
    }>`
      select parent.relname as "table", child.relname as "partition",
        pg_total_relation_size(child.oid) as bytes,
        nullif(child.reltuples, -1)::float8 as approx_rows
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      where ns.nspname = current_schema() and parent.relkind = 'p'
      order by 1, 2
    `.execute(this.db);
    return rows.flatMap((row) => {
      const day = partitionDay(row.partition);
      return day === null
        ? []
        : [
            {
              table: row.table,
              partition: row.partition,
              day,
              bytes: row.bytes,
              approxRows:
                row.approx_rows === null ? null : Math.round(row.approx_rows),
            },
          ];
    });
  }

  async usageRelationSizes(): Promise<RelationSize[]> {
    const plain = [...USAGE].filter((table) => !PARTITIONED.has(table));
    const [partitions, tables] = await Promise.all([
      this.partitionSizes(),
      sql<{ table: string; bytes: number }>`
        select relname as "table", pg_total_relation_size(oid) as bytes
        from pg_class
        where relnamespace = current_schema()::regnamespace and relname in (${sql.join(plain)})
      `.execute(this.db),
    ]);
    return [
      ...partitions
        .filter((p) => USAGE.has(p.table))
        .map((p) => ({ table: p.table, day: p.day, bytes: p.bytes })),
      ...tables.rows.map((t) => ({
        table: t.table,
        day: null,
        bytes: t.bytes,
      })),
    ];
  }

  async dayTotals(): Promise<DayTotal[]> {
    const rows = await this.db
      .selectFrom('application_usage')
      .select(['table_name as table', 'day'])
      .select((eb) => eb.fn.sum<number>('bytes').as('bytes'))
      .groupBy(['table_name', 'day'])
      .execute();
    return rows;
  }

  async applicationCells(applicationIds: string[]): Promise<UsageCell[]> {
    if (applicationIds.length === 0) return [];
    return this.db
      .selectFrom('application_usage')
      .select([
        'application_id as owner',
        'table_name as table',
        'day',
        'rows',
        'bytes',
      ])
      .where('application_id', 'in', applicationIds)
      .execute();
  }

  async projectCells(): Promise<UsageCell[]> {
    return this.db
      .selectFrom('application_usage as u')
      .innerJoin('applications as a', 'a.id', 'u.application_id')
      .select(['a.project_id as owner', 'u.table_name as table', 'u.day'])
      .select((eb) => [
        eb.fn.sum<number>('u.rows').as('rows'),
        eb.fn.sum<number>('u.bytes').as('bytes'),
      ])
      .groupBy(['a.project_id', 'u.table_name', 'u.day'])
      .execute();
  }

  projects(): Promise<ProjectRef[]> {
    return this.db
      .selectFrom('projects')
      .select(['id', 'slug', 'name'])
      .execute();
  }

  applicationsOf(projectId: string): Promise<ApplicationRef[]> {
    return this.db
      .selectFrom('applications')
      .select(['id', 'name'])
      .where('project_id', '=', projectId)
      .execute();
  }

  async trimsOf(projectId: string): Promise<StorageTrim[]> {
    const rows = await this.db
      .selectFrom('storage_trims')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('requested_at')
      .orderBy('id')
      .execute();
    return rows.map(toTrim);
  }
}

@Injectable()
export class PostgresStorageTrimQueue extends StorageTrimQueue {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async enqueue(request: TrimRequest): Promise<StorageTrim> {
    /** The incoming request deletes more than the pending one. */
    const later = sql<boolean>`excluded.cutoff_day > storage_trims.cutoff_day`;
    const row = await this.db
      .insertInto('storage_trims')
      .values({
        project_id: request.projectId,
        application_id: request.applicationId,
        keep_days: request.keepDays,
        cutoff_day: request.cutoffDay,
      })
      .onConflict((oc) =>
        oc.columns(['project_id', 'application_id']).doUpdateSet({
          keep_days: sql<number>`case when ${later} then excluded.keep_days else storage_trims.keep_days end`,
          cutoff_day: sql<string>`greatest(storage_trims.cutoff_day, excluded.cutoff_day)`,
          // a running trim with an earlier cutoff restarts with the new one
          started_at: sql<Date | null>`case when ${later} then null else storage_trims.started_at end`,
          done_steps: sql<number>`case when ${later} then 0 else storage_trims.done_steps end`,
          total_steps: sql<
            number | null
          >`case when ${later} then null else storage_trims.total_steps end`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTrim(row);
  }
}
