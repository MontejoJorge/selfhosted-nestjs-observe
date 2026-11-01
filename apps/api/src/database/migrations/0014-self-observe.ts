import { sql, type Kysely } from 'kysely';

/**
 * Self-observe (ADR 0009): one row with the dashboard's switch and the application the
 * collector reports its own telemetry to. Off by default.
 *
 * `application_id` is set to null when that application (or its project) is deleted, so
 * turning the switch on again creates a new one. `id` is fixed to 1 so the table can
 * never hold a second row; the migration inserts it.
 */
export const selfObserve = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table self_observe (
        id smallint primary key default 1 check (id = 1),
        enabled boolean not null default false,
        application_id uuid references applications (id) on delete set null
      )
    `.execute(db);
    await sql`insert into self_observe (id) values (1)`.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table self_observe`.execute(db);
  },
};
