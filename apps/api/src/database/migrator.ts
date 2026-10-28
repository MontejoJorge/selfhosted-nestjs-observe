import { Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Migrator, type MigrationProvider } from 'kysely/migration';
import { migrations } from './migrations/index.js';

const provider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
};

/** Applies pending migrations. Kysely takes an advisory lock, so concurrent instances are safe. */
export async function migrateToLatest(
  db: Kysely<any>,
  logger = new Logger('Migrator'),
): Promise<void> {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === 'Success')
      logger.log(`Applied migration ${result.migrationName}`);
    if (result.status === 'Error')
      logger.error(`Migration ${result.migrationName} failed`);
  }
  if (error)
    throw error instanceof Error ? error : new Error(JSON.stringify(error));
}
