import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type {
  ExecutionSource,
  ServicesDto,
  SlowSpanDto,
} from './services.dto.js';

export interface ServicesFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  source?: ExecutionSource;
  operationId?: string;
  queue?: string;
  name?: string;
}

export interface SlowSpansFilter extends ServicesFilter {
  className: string;
  methodName: string;
  limit: number;
}

/** Read port for where execution time is spent, by span class and method. */
export abstract class ServicesRepository {
  abstract services(filter: ServicesFilter): Promise<ServicesDto>;
  abstract slowestSpans(filter: SlowSpansFilter): Promise<SlowSpanDto[]>;
}
