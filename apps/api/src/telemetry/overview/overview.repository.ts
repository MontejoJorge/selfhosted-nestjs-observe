import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { OverviewDto } from './overview.dto.js';

export interface OverviewFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  /** scopes the requests block and the timeline */
  operationId?: string;
  /** with `name`, scopes the jobs block and the jobs timeline */
  queue?: string;
  name?: string;
}

/** Read port for the overview page. */
export abstract class OverviewRepository {
  abstract get(filter: OverviewFilter): Promise<OverviewDto>;
}
