import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';

/** Read port: the UTC days on which a scope has telemetry. */
export abstract class DataDaysRepository {
  /**
   * Days (`YYYY-MM-DD`, ascending) of the window (whole UTC days, `from` at midnight)
   * with raw telemetry or per-minute rollups of the scope's applications.
   */
  abstract list(scope: TelemetryScope, window: TimeWindow): Promise<string[]>;
}
