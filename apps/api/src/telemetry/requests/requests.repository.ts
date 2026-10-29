import type { KeysetCursor, Page } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type {
  OperationStatsDto,
  RequestDetailDto,
  RequestListItemDto,
} from './requests.dto.js';

export interface RequestFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  operationId?: string;
  status?: 'ok' | 'error';
  minDurationMs?: number;
  traceId?: string;
  userId?: string;
}

/** Read port for request executions. */
export abstract class RequestsRepository {
  abstract operations(filter: RequestFilter): Promise<OperationStatsDto[]>;
  abstract list(
    filter: RequestFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<RequestListItemDto>>;
  abstract findById(
    scope: TelemetryScope,
    id: string,
  ): Promise<RequestDetailDto | null>;
  abstract findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<RequestDetailDto[]>;
}
