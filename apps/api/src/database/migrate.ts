/**
 * Standalone migration runner: `pnpm --filter api db:migrate`.
 * Reads DATABASE_URL from the environment, `apps/api/.env` or the root `.env`.
 */
import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { createDatabase } from './create-database.js';
import { migrateToLatest } from './migrator.js';

for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const db = createDatabase({ connectionString, poolMax: 1 });
try {
  await migrateToLatest(db, new Logger('Migrator'));
  new Logger('Migrator').log('Database is up to date');
} finally {
  await db.destroy();
}
