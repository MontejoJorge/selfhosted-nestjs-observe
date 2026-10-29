import { sql, type Kysely } from 'kysely';

/**
 * API keys no longer expire nor track their last use: a key is active until it is
 * revoked or deleted. Dropping the columns is a catalog-only change (no table rewrite).
 */
export const dropApiKeyExpiryUsage = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`alter table api_keys drop column expires_at, drop column last_used_at`.execute(
      db,
    );
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`alter table api_keys add column expires_at timestamptz, add column last_used_at timestamptz`.execute(
      db,
    );
  },
};
