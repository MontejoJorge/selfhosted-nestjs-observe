import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import {
  KYSELY,
  PARTITIONED_TABLES,
  ROLLUP_TABLES,
  type Db,
  type PartitionedTable,
} from '../database/database.types.js';
import { PartitionManager, utcDay } from '../database/partition-manager.js';
import { ApplicationPurger } from './application-purger.js';

const DAY_MS = 86_400_000;
/** Daily partitions created ahead of time, so ingest never waits on DDL. */
const DAYS_AHEAD = 3;

const ROLLUPS = new Set<string>(ROLLUP_TABLES);
/** Raw telemetry, kept for RETENTION_DAYS. */
const RAW_TABLES = (
  Object.keys(PARTITIONED_TABLES) as PartitionedTable[]
).filter((table) => !ROLLUPS.has(table));

/**
 * Keeps the partition window rolling: creates upcoming daily partitions and drops
 * raw telemetry older than RETENTION_DAYS and rollups older than
 * AGGREGATE_RETENTION_DAYS (never less than RETENTION_DAYS), prunes the
 * non-partitioned tables, and finishes any
 * pending purge of deleted applications.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly retentionDays: number;
  private readonly aggregateRetentionDays: number;
  private running = false;

  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly partitions: PartitionManager,
    private readonly purger: ApplicationPurger,
    config: ConfigService<Env, true>,
  ) {
    this.retentionDays = config.get('RETENTION_DAYS', { infer: true });
    this.aggregateRetentionDays = Math.max(
      this.retentionDays,
      config.get('AGGREGATE_RETENTION_DAYS', { infer: true }),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduled(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'Maintenance failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.partitions.ensureWindow(1, DAYS_AHEAD);

      const cutoff = new Date(Date.now() - this.retentionDays * DAY_MS);
      const rollupCutoff = new Date(
        Date.now() - this.aggregateRetentionDays * DAY_MS,
      );
      const dropped = [
        ...(await this.partitions.dropBefore(utcDay(cutoff), RAW_TABLES)),
        ...(await this.partitions.dropBefore(
          utcDay(rollupCutoff),
          ROLLUP_TABLES,
        )),
      ];
      if (dropped.length > 0)
        this.logger.log(`Dropped ${dropped.length} expired partitions`);

      // error_groups and profiles are not partitioned (low volume): delete by time.
      await this.db
        .deleteFrom('error_groups')
        .where('last_seen_at', '<', cutoff)
        .execute();
      await this.db
        .deleteFrom('profiles')
        .where('received_at', '<', cutoff)
        .execute();

      // Telemetry of deleted applications (normally purged right after the delete).
      await this.purger.run();
    } finally {
      this.running = false;
    }
  }
}
