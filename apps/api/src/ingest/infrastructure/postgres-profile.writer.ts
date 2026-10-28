import { Inject, Injectable } from '@nestjs/common';
import { toJson } from '../../database/batch-insert.js';
import { KYSELY, type Db } from '../../database/database.types.js';
import { ProfileWriter } from '../application/ports.js';
import type { ProfileUpload } from '../domain/telemetry.js';

@Injectable()
export class PostgresProfileWriter extends ProfileWriter {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async write(upload: ProfileUpload): Promise<void> {
    await this.db
      .insertInto('profiles')
      .values({
        received_at: upload.receivedAt,
        application_id: upload.applicationId,
        service_node: upload.serviceNode,
        sample_rate_hz: upload.sampleRateHz,
        windows: toJson(upload.windows) ?? '[]',
      })
      .execute();
  }
}
