import type { InstanceSummary } from '@selfhosted-observe/contracts';
import type { TelemetryScope } from '../common/scope.js';

/** Read port for the instances (serviceIds) that sent telemetry. */
export abstract class InstancesRepository {
  abstract list(scope: TelemetryScope): Promise<InstanceSummary[]>;
}
