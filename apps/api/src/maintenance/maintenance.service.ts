import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { KYSELY, type Db } from '../database/database.types.js';
import { PartitionManager, utcDay } from '../database/partition-manager.js';

const DAY_MS = 86_400_000;
/** Daily partitions created ahead of time, so ingest never waits on DDL. */
const DAYS_AHEAD = 3;

/**
 * Keeps the partition window rolling: creates upcoming daily partitions and drops
 * those older than RETENTION_DAYS, then prunes the non-partitioned tables.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly retentionDays: number;
  private running = false;

  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly partitions: PartitionManager,
    config: ConfigService<Env, true>,
  ) {
    this.retentionDays = config.get('RETENTION_DAYS', { infer: true });
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
      const dropped = await this.partitions.dropBefore(utcDay(cutoff));
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
    } finally {
      this.running = false;
    }
  }
}
