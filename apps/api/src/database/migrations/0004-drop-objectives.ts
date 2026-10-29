import { sql, type Kysely } from 'kysely';

/**
 * SLOs are out of scope: the collector still accepts the batch's `objectives` section
 * (it is part of the agent's contract) but no longer stores it.
 */
export const dropObjectives = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists objectives`.execute(db);
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`create table objectives (
      application_id uuid not null,
      operation_id text not null,
      handler text not null,
      service_id text not null,
      method text,
      objectives jsonb not null,
      updated_at timestamptz not null,
      primary key (application_id, operation_id, handler)
    )`.execute(db);
  },
};
