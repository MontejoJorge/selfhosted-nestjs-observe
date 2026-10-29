import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import {
  KYSELY,
  PARTITIONED_TABLES,
  type Db,
  type PartitionedTable,
} from './database.types.js';

const DAY_MS = 86_400_000;
const PARTITION_SUFFIX = /_p(\d{4})(\d{2})(\d{2})$/;

/** `YYYY-MM-DD` (UTC) for a date. */
export function utcDay(date: Date | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

function partitionName(table: PartitionedTable, day: string): string {
  return `${table}_p${day.replaceAll('-', '')}`;
}

/**
 * Creates and drops the daily partitions of the time-series tables.
 * Partitions are UTC days named `<table>_pYYYYMMDD`.
 */
@Injectable()
export class PartitionManager {
  private readonly logger = new Logger(PartitionManager.name);
  /** Days known to have partitions for every table. */
  private readonly knownDays = new Set<string>();

  constructor(@Inject(KYSELY) private readonly db: Db) {}

  /** Makes sure partitions exist for the given UTC days. Cheap when they are already known. */
  async ensureDays(days: Iterable<string>): Promise<void> {
    const missing = [...new Set(days)]
      .filter((day) => !this.knownDays.has(day))
      .sort();
    if (missing.length === 0) return;

    // One transaction with an advisory lock so concurrent ingests and instances
    // don't race on CREATE TABLE.
    await this.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext('observe:partitions'))`.execute(
        trx,
      );
      for (const day of missing) {
        const from = `${day} 00:00:00+00`;
        const to = `${addDays(day, 1)} 00:00:00+00`;
        for (const table of Object.keys(
          PARTITIONED_TABLES,
        ) as PartitionedTable[]) {
          await sql
            .raw(
              `create table if not exists ${partitionName(table, day)} partition of ${table} ` +
                `for values from ('${from}') to ('${to}')`,
            )
            .execute(trx);
        }
      }
    });
    for (const day of missing) this.knownDays.add(day);
  }

  /** Creates partitions from `daysBack` days ago to `daysAhead` days from now. */
  async ensureWindow(daysBack: number, daysAhead: number): Promise<void> {
    const today = utcDay(Date.now());
    const days: string[] = [];
    for (let offset = -daysBack; offset <= daysAhead; offset++)
      days.push(addDays(today, offset));
    await this.ensureDays(days);
  }

  /** Names of the existing partitions of one table, oldest first. */
  async partitionsOf(table: PartitionedTable): Promise<string[]> {
    const { rows } = await sql<{ child: string }>`
      select child.relname as child
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      where ns.nspname = current_schema() and parent.relname = ${table}
      order by child.relname
    `.execute(this.db);
    return rows.map((row) => row.child);
  }

  /**
   * Drops every partition of `tables` whose day is before `cutoffDay` (`YYYY-MM-DD`).
   * Returns the dropped names.
   */
  async dropBefore(
    cutoffDay: string,
    tables: readonly PartitionedTable[],
  ): Promise<string[]> {
    if (tables.length === 0) return [];
    const parents = [...tables];
    const { rows } = await sql<{ parent: string; child: string }>`
      select parent.relname as parent, child.relname as child
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      where ns.nspname = current_schema() and parent.relname in (${sql.join(parents)})
    `.execute(this.db);

    const dropped: string[] = [];
    for (const { parent, child } of rows) {
      const match = PARTITION_SUFFIX.exec(child);
      if (!match) continue;
      const day = `${match[1]}-${match[2]}-${match[3]}`;
      if (day >= cutoffDay) continue;
      try {
        // DETACH CONCURRENTLY avoids blocking ingest and queries on the parent.
        await sql
          .raw(`alter table ${parent} detach partition ${child} concurrently`)
          .execute(this.db);
      } catch (error) {
        this.logger.warn(
          `Concurrent detach of ${child} failed, dropping directly: ${String(error)}`,
        );
      }
      await sql.raw(`drop table if exists ${child}`).execute(this.db);
      this.knownDays.delete(day);
      dropped.push(child);
    }
    return dropped;
  }
}
