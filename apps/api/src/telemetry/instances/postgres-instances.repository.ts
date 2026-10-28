import { Inject, Injectable } from '@nestjs/common';
import type { InstanceSummary } from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { InstancesRepository } from './instances.repository.js';

/** Upper bound on instances returned (pods come and go). */
const INSTANCES_LIMIT = 1000;

@Injectable()
export class PostgresInstancesRepository extends InstancesRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /** Primary key range scan on (application_id, service_id). */
  async list(scope: TelemetryScope): Promise<InstanceSummary[]> {
    const rows = await this.db
      .selectFrom('services')
      .select([
        'application_id',
        'service_id',
        'service_version',
        'first_seen_at',
        'last_seen_at',
      ])
      .where(inApplications('application_id', scope.applicationIds))
      .orderBy('last_seen_at', 'desc')
      .orderBy('service_id')
      .limit(INSTANCES_LIMIT)
      .execute();
    return rows.map((row) => ({
      applicationId: row.application_id,
      serviceId: row.service_id,
      serviceVersion: row.service_version,
      firstSeenAt: row.first_seen_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    }));
  }
}
