import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './database.types.js';

// Return int8 (count, bigint ids) as JS numbers. Ids are cast to text in queries where needed.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
// Return numeric (avg, sum) as JS numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export interface DatabaseOptions {
  connectionString: string;
  poolMax: number;
}

export function createDatabase({
  connectionString,
  poolMax,
}: DatabaseOptions): Kysely<Database> {
  const pool = new pg.Pool({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'selfhosted-observe-api',
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
