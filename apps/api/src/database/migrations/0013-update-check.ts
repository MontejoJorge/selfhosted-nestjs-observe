import { sql, type Kysely } from 'kysely';

/**
 * Update check (ADR 0008): one row with the dashboard's on/off switch and the result of the
 * last look at the latest GitHub release, so a restart neither forgets the switch nor
 * asks GitHub again before the 12 hours are up.
 *
 * `id` is fixed to 1 so the table can never hold a second row; the migration inserts it.
 */
export const updateCheck = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table update_check (
        id smallint primary key default 1 check (id = 1),
        enabled boolean not null default true,
        latest_version text,
        latest_url text,
        latest_published_at timestamptz,
        checked_at timestamptz,
        error text
      )
    `.execute(db);
    await sql`insert into update_check (id) values (1)`.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table update_check`.execute(db);
  },
};
