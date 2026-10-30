import { Inject, Injectable } from '@nestjs/common';
import { toJson } from '../../database/batch-insert.js';
import { KYSELY, type Db } from '../../database/database.types.js';
import { ProfileWriter } from '../application/ports.js';
import type { ProfileUpload } from '../domain/telemetry.js';
import { UsageTally, upsertUsage } from './usage-tally.js';

@Injectable()
export class PostgresProfileWriter extends ProfileWriter {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async write(upload: ProfileUpload): Promise<void> {
    const row = {
      received_at: upload.receivedAt,
      application_id: upload.applicationId,
      service_node: upload.serviceNode,
      sample_rate_hz: upload.sampleRateHz,
      windows: toJson(upload.windows) ?? '[]',
    };
    const usage = new UsageTally();
    usage.add('profiles', [row]);
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('profiles').values(row).execute();
      await upsertUsage(trx, usage.rowsOf(upload.applicationId));
    });
  }
}
