import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  UpdateCheckRepository,
  type LatestRelease,
  type UpdateCheckState,
} from '../application/ports.js';

/** The single `update_check` row (`id = 1`, inserted by migration 0013). */
@Injectable()
export class PostgresUpdateCheckRepository extends UpdateCheckRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async get(): Promise<UpdateCheckState> {
    const row = await this.db
      .selectFrom('update_check')
      .select([
        'enabled',
        'latest_version',
        'latest_url',
        'latest_published_at',
        'checked_at',
        'error',
      ])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      enabled: row.enabled,
      latest:
        row.latest_version !== null && row.latest_url !== null
          ? {
              version: row.latest_version,
              url: row.latest_url,
              publishedAt: row.latest_published_at,
            }
          : null,
      checkedAt: row.checked_at,
      error: row.error,
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.db
      .updateTable('update_check')
      .set({ enabled })
      .where('id', '=', 1)
      .execute();
  }

  async saveLatest(
    latest: LatestRelease | null,
    checkedAt: Date,
  ): Promise<void> {
    await this.db
      .updateTable('update_check')
      .set({
        latest_version: latest?.version ?? null,
        latest_url: latest?.url ?? null,
        latest_published_at: latest?.publishedAt ?? null,
        checked_at: checkedAt,
        error: null,
      })
      .where('id', '=', 1)
      .execute();
  }

  async saveFailure(error: string, checkedAt: Date): Promise<void> {
    await this.db
      .updateTable('update_check')
      .set({ checked_at: checkedAt, error })
      .where('id', '=', 1)
      .execute();
  }
}
