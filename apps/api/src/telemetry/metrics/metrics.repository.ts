import type {
  CustomMetricSummary,
  RuntimeSeriesPoint,
} from '@selfhosted-observe/contracts';
import type { TimeWindow } from '../common/time-window.js';

/** Read port for runtime and custom metrics. */
export abstract class MetricsRepository {
  /** Runtime samples of one service averaged per bucket. */
  abstract runtime(
    serviceId: string,
    window: TimeWindow,
  ): Promise<RuntimeSeriesPoint[]>;
  /** Latest value of each custom metric seen in the window. */
  abstract custom(
    window: TimeWindow,
    serviceId?: string,
  ): Promise<CustomMetricSummary[]>;
}
