import type { Migration } from 'kysely/migration';
import { initialSchema } from './0001-initial-schema.js';
import { projectsApplications } from './0002-projects-applications.js';
import { dropApiKeyExpiryUsage } from './0003-drop-api-key-expiry-usage.js';
import { dropObjectives } from './0004-drop-objectives.js';
import { minuteRollups } from './0005-minute-rollups.js';
import { usersRollup } from './0006-users-rollup.js';
import { spanStats } from './0007-span-stats.js';
import { userActivity } from './0008-user-activity.js';
import { dropSpans } from './0009-drop-spans.js';
import { storageUsage } from './0010-storage-usage.js';
import { serviceVersions } from './0011-service-versions.js';
import { projectRangePresets } from './0012-project-range-presets.js';

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
  '0006-users-rollup': usersRollup,
  '0007-span-stats': spanStats,
  '0008-user-activity': userActivity,
  '0009-drop-spans': dropSpans,
  '0010-storage-usage': storageUsage,
  '0011-service-versions': serviceVersions,
  '0012-project-range-presets': projectRangePresets,
};
