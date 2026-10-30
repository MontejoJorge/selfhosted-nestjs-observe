import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import { deleteInBatches, vacuumTable } from '../database/cleanup.js';
import {
  KYSELY,
  PARTITIONED_TABLES,
  USAGE_TABLES,
  type Db,
  type PartitionedTable,
  type StorageTrimsTable,
  type UsageTable,
} from '../database/database.types.js';
import {
  PartitionManager,
  partitionDay,
} from '../database/partition-manager.js';

type StorageTrim = Selectable<StorageTrimsTable>;

/** One table or partition a trim deletes from. */
interface TrimTarget {
  table: UsageTable;
  relation: string;
}

/**
 * Processes `storage_trims`: deletes the rows of a project's applications (or one
 * application) older than the trim's cutoff day from the raw tables (`USAGE_TABLES`),
 * one partition at a time and in batches, and runs a plain `VACUUM` on every partition it
 * deleted from. Rollups and error groups are left alone: they have their own retention.
 *
 * Only partitions of days before the cutoff can hold such rows (the cutoff is a UTC day
 * boundary), and each statement also filters on the time column, which is what bounds the
 * delete in `profiles` (not partitioned). Progress (`done_steps` of `total_steps`) is
 * saved after each partition. An interrupted trim starts over on the next run: partitions
 * already trimmed only cost an index lookup. The trim row is removed when done, unless a
 * newer request for the same target moved its cutoff later meanwhile (it then runs again).
 */
@Injectable()
export class StorageTrimmer {
  private readonly logger = new Logger(StorageTrimmer.name);
  private running: Promise<void> | null = null;

  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly partitions: PartitionManager,
  ) {}

  /** Starts a trim run in the background unless one is in progress. */
  trigger(): void {
    void this.run().catch((error: unknown) =>
      this.logger.error(
        'Storage trim failed',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  /** Runs every pending trim, oldest request first. Concurrent calls share the same run. */
  run(): Promise<void> {
    this.running ??= this.trimPending().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async trimPending(): Promise<void> {
    const skipped = new Set<string>();
    for (;;) {
      let next = this.db
        .selectFrom('storage_trims')
        .selectAll()
        .orderBy('requested_at')
        .orderBy('id')
        .limit(1);
      if (skipped.size > 0) next = next.where('id', 'not in', [...skipped]);
      const trim = await next.executeTakeFirst();
      if (!trim) return;
      try {
        await this.trim(trim);
      } catch (error) {
        // Left in the table: the next maintenance run retries it.
        skipped.add(trim.id);
        this.logger.error(
          `Storage trim ${trim.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async trim(trim: StorageTrim): Promise<void> {
    const applicationIds = trim.application_id
      ? [trim.application_id]
      : (
          await this.db
            .selectFrom('applications')
            .select('id')
            .where('project_id', '=', trim.project_id)
            .execute()
        ).map((row) => row.id);
    const targets = await this.targets(trim.cutoff_day);
    const cutoff = new Date(`${trim.cutoff_day}T00:00:00Z`);

    await this.db
      .updateTable('storage_trims')
      .set({
        started_at: sql<Date>`coalesce(started_at, now())`,
        done_steps: 0,
        total_steps: targets.length,
      })
      .where('id', '=', trim.id)
      .execute();

    let deletedRows = 0;
    if (applicationIds.length > 0) {
      const inApplications = sql`application_id in (${sql.join(applicationIds)})`;
      for (const { table, relation } of targets) {
        const deleted = await deleteInBatches(
          this.db,
          relation,
          sql`${inApplications} and ${sql.ref(USAGE_TABLES[table])} < ${cutoff}`,
        );
        if (deleted > 0) await vacuumTable(this.db, relation, this.logger);
        deletedRows += deleted;
        await this.db
          .updateTable('storage_trims')
          .set({ done_steps: sql<number>`done_steps + 1` })
          .where('id', '=', trim.id)
          .execute();
      }
      await this.db
        .deleteFrom('application_usage')
        .where('application_id', 'in', applicationIds)
        .where('day', '<', trim.cutoff_day)
        .execute();
    }

    const finished = await this.db
      .deleteFrom('storage_trims')
      .where('id', '=', trim.id)
      .where('cutoff_day', '=', trim.cutoff_day)
      .executeTakeFirst();
    this.logger.log(
      `Storage trim of ${trim.application_id ? `application ${trim.application_id}` : `project ${trim.project_id}`} ` +
        `before ${trim.cutoff_day}: ${deletedRows} rows deleted` +
        (Number(finished.numDeletedRows) === 0
          ? ' (requested again, rerunning)'
          : ''),
    );
  }

  /** Partitions of the raw tables before `cutoffDay`, oldest first, then `profiles`. */
  private async targets(cutoffDay: string): Promise<TrimTarget[]> {
    const targets: TrimTarget[] = [];
    for (const table of Object.keys(USAGE_TABLES) as UsageTable[]) {
      if (!(table in PARTITIONED_TABLES)) {
        targets.push({ table, relation: table });
        continue;
      }
      for (const relation of await this.partitions.partitionsOf(
        table as PartitionedTable,
      )) {
        const day = partitionDay(relation);
        if (day !== null && day < cutoffDay) targets.push({ table, relation });
      }
    }
    return targets;
  }
}
