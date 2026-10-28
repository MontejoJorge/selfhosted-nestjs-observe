/**
 * Standalone migration runner: `pnpm --filter api db:migrate`.
 * Reads the DATABASE_* variables from the environment, `apps/api/.env` or the root `.env`
 * (validated with the same schema and defaults as the app).
 */
import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import 'reflect-metadata';
import { databaseOptions, validateEnv } from '../config/env.js';
import { createDatabase } from './create-database.js';
import { migrateToLatest } from './migrator.js';

// Real environment variables win: loadEnvFile does not override them, and the
// first file loaded (apps/api/.env) wins over the root one.
for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const env = validateEnv(process.env);
const db = createDatabase({
  ...databaseOptions((key) => env[key]),
  poolMax: 1,
});
try {
  await migrateToLatest(db, new Logger('Migrator'));
  new Logger('Migrator').log('Database is up to date');
} finally {
  await db.destroy();
}
