import type {
  OperationStats,
  Page,
  RequestDetail,
  RequestListItem,
} from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TimeWindow } from '../common/time-window.js';

export interface RequestFilter {
  window: TimeWindow;
  serviceId?: string;
  operationId?: string;
  status?: 'ok' | 'error';
  minDurationMs?: number;
  traceId?: string;
}

/** Read port for request executions. */
export abstract class RequestsRepository {
  abstract operations(filter: RequestFilter): Promise<OperationStats[]>;
  abstract list(
    filter: RequestFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<RequestListItem>>;
  abstract findById(id: string): Promise<RequestDetail | null>;
  abstract findByTraceId(traceId: string): Promise<RequestDetail[]>;
}
