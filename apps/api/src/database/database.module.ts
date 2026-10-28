import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createDatabase } from './create-database.js';
import { KYSELY, type Db } from './database.types.js';
import { migrateToLatest } from './migrator.js';
import { PartitionManager } from './partition-manager.js';

/** Runs migrations on startup (unless disabled) and closes the pool on shutdown. */
@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Database');

  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('DATABASE_MIGRATE_ON_START', { infer: true })) {
      await migrateToLatest(this.db, this.logger);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Db =>
        createDatabase({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          poolMax: config.get('DATABASE_POOL_MAX', { infer: true }),
        }),
    },
    DatabaseLifecycle,
    PartitionManager,
  ],
  exports: [KYSELY, PartitionManager],
})
export class DatabaseModule {}
