import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { deleteInBatches, vacuumTable } from '../database/cleanup.js';
import {
  APPLICATION_SCOPED_TABLES,
  KYSELY,
  PARTITIONED_TABLES,
  type Db,
  type PartitionedTable,
} from '../database/database.types.js';
import { PartitionManager } from '../database/partition-manager.js';

const PARTITIONED = new Set<string>(Object.keys(PARTITIONED_TABLES));

/**
 * Deletes the telemetry of deleted applications.
 *
 * Deleting an application only records it in `application_purges` (in the same
 * transaction), so the API answers at once. This worker then deletes its rows one table,
 * and for day-partitioned tables one partition, at a time, in batches over the indexes
 * that lead with `application_id`, and runs a plain `VACUUM` on every table or partition
 * it deleted from. The purge row is removed when every table is clean, so an interrupted
 * purge resumes on the next run. Its `application_usage` rows go last.
 */
@Injectable()
export class ApplicationPurger {
  private readonly logger = new Logger(ApplicationPurger.name);
  private running: Promise<void> | null = null;

  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly partitions: PartitionManager,
  ) {}

  /** Starts a purge run in the background unless one is in progress. */
  trigger(): void {
    void this.run().catch((error: unknown) =>
      this.logger.error(
        'Application purge failed',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  /** Purges every pending application. Concurrent calls share the same run. */
  run(): Promise<void> {
    this.running ??= this.purgePending().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async purgePending(): Promise<void> {
    const pending = await this.db
      .selectFrom('application_purges')
      .select('application_id')
      .orderBy('requested_at')
      .execute();
    for (const { application_id: applicationId } of pending) {
      await this.purge(applicationId);
      await this.db
        .deleteFrom('application_purges')
        .where('application_id', '=', applicationId)
        .execute();
      this.logger.log(`Purged telemetry of application ${applicationId}`);
    }
  }

  private async purge(applicationId: string): Promise<void> {
    for (const table of APPLICATION_SCOPED_TABLES) {
      const targets = PARTITIONED.has(table)
        ? await this.partitions.partitionsOf(table as PartitionedTable)
        : [table];
      for (const target of targets) {
        const deleted = await deleteInBatches(
          this.db,
          target,
          sql`application_id = ${applicationId}`,
        );
        if (deleted > 0) await vacuumTable(this.db, target, this.logger);
      }
    }
  }
}
