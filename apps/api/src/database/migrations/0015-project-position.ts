import { sql, type Kysely } from 'kysely';

/**
 * Manual order of the projects page: `position`, ascending, ties broken by id.
 *
 * The default comes from a sequence, so every new project lands after the others with no
 * extra query (including the self-observe one, inserted outside the projects service).
 * A reorder rewrites the positions as 1..n; the sequence is always past them. Existing
 * projects keep their alphabetical order. `projects` is a small management table, so the
 * backfill is one short update.
 */
export const projectPosition = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`create sequence projects_position_seq as integer`.execute(db);
    await sql`
      alter table projects
        add column position integer not null default nextval('projects_position_seq')
    `.execute(db);
    await sql`alter sequence projects_position_seq owned by projects.position`.execute(
      db,
    );
    await sql`
      update projects p
         set position = o.n
        from (select id, row_number() over (order by name, id) as n from projects) o
       where o.id = p.id
    `.execute(db);
    await sql`
      select setval('projects_position_seq', coalesce(max(position), 0) + 1, false)
        from projects
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // Drops the owned sequence too.
    await sql`alter table projects drop column position`.execute(db);
  },
};
