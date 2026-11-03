import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { MapDto } from './map.dto.js';

export interface MapFilter {
  scope: TelemetryScope;
  window: TimeWindow;
}

/** Read port for the map of applications, queues, databases and external services. */
export abstract class MapRepository {
  abstract map(filter: MapFilter): Promise<MapDto>;
}
