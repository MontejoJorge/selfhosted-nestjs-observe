import type {
  RuntimeInstance,
  RuntimeMetrics,
} from '@selfhosted-observe/contracts';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';

/** Read port for runtime metrics. */
export abstract class MetricsRepository {
  /** KPI summary and bucketed series of the runtime samples in scope (one application). */
  abstract runtime(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<RuntimeMetrics>;
  /** Instances that sent runtime samples in the window, with their newest sample. */
  abstract instances(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<RuntimeInstance[]>;
}
