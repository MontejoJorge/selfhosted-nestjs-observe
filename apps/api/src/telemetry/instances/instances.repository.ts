import type { TelemetryScope } from '../common/scope.js';
import type { InstanceSummaryDto } from './instances.dto.js';

/** Read port for the instances (serviceIds) that sent telemetry. */
export abstract class InstancesRepository {
  abstract list(scope: TelemetryScope): Promise<InstanceSummaryDto[]>;
}
