import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TracerService } from '@nestjs/observe';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Env } from '../config/env.js';
import type { InventoryTables } from './database.types.js';
import { createSchema, seed } from './schema.js';
import { TracedDialect } from './traced-dialect.js';

/**
 * The local SQLite inventory database. Repositories query it through `db`, a
 * Kysely instance whose queries each become a span (see TracedDialect).
 *
 * Kysely is held in a field rather than registered as a provider: the agent
 * wraps every provider's methods in spans, and a traced `selectFrom` or
 * `where` would bury the query spans under builder calls.
 */
@Injectable()
export class InventoryDatabase implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(InventoryDatabase.name);
  readonly db: Kysely<InventoryTables>;
  private readonly file: string;

  constructor(config: ConfigService<Env, true>, tracer: TracerService) {
    this.file = resolve(config.get('SQLITE_FILE', { infer: true }));
    mkdirSync(dirname(this.file), { recursive: true });
    const sqlite = new Database(this.file);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    this.db = new Kysely<InventoryTables>({
      dialect: new TracedDialect(
        new SqliteDialect({ database: sqlite }),
        tracer,
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await createSchema(this.db);
    await seed(this.db);
    this.logger.log(`SQLite inventory ready at ${this.file}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
