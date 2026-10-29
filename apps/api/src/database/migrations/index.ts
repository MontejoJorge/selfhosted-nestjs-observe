import type { Migration } from 'kysely/migration';
import { initialSchema } from './0001-initial-schema.js';
import { projectsApplications } from './0002-projects-applications.js';
import { dropApiKeyExpiryUsage } from './0003-drop-api-key-expiry-usage.js';
import { dropObjectives } from './0004-drop-objectives.js';
import { minuteRollups } from './0005-minute-rollups.js';

/**
 * All migrations, keyed by name. Names sort lexicographically, so keep the numeric
 * prefix. An explicit list (instead of FileMigrationProvider) keeps migrations
 * bundled with the compiled app and avoids ESM path issues on Windows.
 */
export const migrations: Record<string, Migration> = {
  '0001-initial-schema': initialSchema,
  '0002-projects-applications': projectsApplications,
  '0003-drop-api-key-expiry-usage': dropApiKeyExpiryUsage,
  '0004-drop-objectives': dropObjectives,
  '0005-minute-rollups': minuteRollups,
};
