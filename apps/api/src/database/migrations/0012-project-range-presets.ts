import { sql, type Kysely } from 'kysely';

/**
 * Range presets per project: the three relative ranges of the dashboard header's
 * segmented control, sorted by duration (the API sorts them on write).
 *
 * `projects` is a small management table and the default is a constant, so adding the
 * column is a catalog-only change. The check mirrors `TIME_RANGES`; adding a range there
 * needs a migration that widens it.
 */
export const projectRangePresets = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      alter table projects
        add column range_presets text[] not null default '{1h,24h,7d}',
        add constraint projects_range_presets_check check (
          cardinality(range_presets) = 3
          and range_presets <@ array['1h', '3h', '6h', '12h', '24h', '3d', '7d', '15d']
        )
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`alter table projects drop column range_presets`.execute(db);
  },
};
