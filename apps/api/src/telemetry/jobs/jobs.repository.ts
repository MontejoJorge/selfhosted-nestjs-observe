import type { KeysetCursor, Page } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { JobDetailDto, JobListItemDto, JobStatsDto } from './jobs.dto.js';

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
  abstract queues(filter: JobFilter): Promise<JobStatsDto[]>;
  abstract list(
    filter: JobFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<JobListItemDto>>;
  abstract findById(
    scope: TelemetryScope,
    id: string,
  ): Promise<JobDetailDto | null>;
  abstract findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<JobDetailDto[]>;
}
