import type { Overview } from '@selfhosted-observe/contracts';
import type { TimeWindow } from '../common/time-window.js';

export interface OverviewFilter {
  window: TimeWindow;
  serviceId?: string;
  /** scopes the requests block and the timeline */
  operationId?: string;
  /** with `name`, scopes the jobs block and the jobs timeline */
  queue?: string;
  name?: string;
}

/** Read port for the overview page. */
export abstract class OverviewRepository {
  abstract get(filter: OverviewFilter): Promise<Overview>;
}
