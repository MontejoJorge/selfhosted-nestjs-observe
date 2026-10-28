import { Inject, Injectable } from '@nestjs/common';
import type { ServiceSummary } from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { ServicesRepository } from './services.repository.js';

@Injectable()
export class PostgresServicesRepository extends ServicesRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async list(): Promise<ServiceSummary[]> {
    const rows = await this.db
      .selectFrom('services')
      .select([
        'service_id',
        'service_version',
        'first_seen_at',
        'last_seen_at',
      ])
      .orderBy('service_id')
      .execute();
    return rows.map((row) => ({
      serviceId: row.service_id,
      serviceVersion: row.service_version,
      firstSeenAt: row.first_seen_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    }));
  }
}
