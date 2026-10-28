import type {
  JobDetail,
  JobListItem,
  JobStats,
  Page,
} from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';

export interface JobFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  queue?: string;
  name?: string;
  status?: 'completed' | 'failed';
  traceId?: string;
}

/** Read port for job executions. */
export abstract class JobsRepository {
  abstract queues(filter: JobFilter): Promise<JobStats[]>;
  abstract list(
    filter: JobFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<JobListItem>>;
  abstract findById(
    scope: TelemetryScope,
    id: string,
  ): Promise<JobDetail | null>;
  abstract findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<JobDetail[]>;
}
