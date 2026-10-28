import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  toPage,
  type KeysetCursor,
  type Page,
} from '../../telemetry/common/cursor.js';
import { apiKeyStatus } from '../domain/api-key.js';
import type { ApiKeyDto } from './api-keys.dto.js';
import { ApiKeysRepository, type NewApiKey } from './api-keys.repository.js';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_id: string;
  application_id: string;
  application_name: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

@Injectable()
export class PostgresApiKeysRepository extends ApiKeysRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  private withApplication() {
    return this.db
      .selectFrom('api_keys as k')
      .innerJoin('applications as a', 'a.id', 'k.application_id')
      .select([
        'k.id',
        'k.name',
        'k.key_id',
        'k.application_id',
        'a.name as application_name',
        'k.expires_at',
        'k.revoked_at',
        'k.last_used_at',
        'k.created_at',
      ]);
  }

  /** Index range on (project_id, created_at desc, id desc), joined to applications by primary key. */
  async list(
    projectId: string,
    filter: { applicationId?: string },
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<ApiKeyDto>> {
    let query = this.withApplication().where('k.project_id', '=', projectId);
    if (filter.applicationId)
      query = query.where('k.application_id', '=', filter.applicationId);
    const { cursor } = page;
    if (cursor) {
      query = query.where((eb) =>
        eb(
          eb.refTuple('k.created_at', 'k.id'),
          '<',
          eb.tuple(cursor.t, cursor.id),
        ),
      );
    }
    const rows = await query
      .orderBy('k.created_at', 'desc')
      .orderBy('k.id', 'desc')
      .limit(page.limit + 1)
      .execute();
    const now = new Date();
    return toPage(
      rows,
      page.limit,
      (row) => ({ t: row.created_at, id: row.id }),
      (row) => toApiKey(row, now),
    );
  }

  async insert(key: NewApiKey): Promise<ApiKeyDto | null> {
    // INSERT ... SELECT: no row (and no key) when the application is not in the project.
    const { rows } = await sql<ApiKeyRow>`
      with inserted as (
        insert into api_keys (project_id, application_id, name, key_id, secret_hash, expires_at)
        select a.project_id, a.id, ${key.name}, ${key.keyId}, ${key.secretHash}, ${key.expiresAt}
        from applications a
        where a.id = ${key.applicationId} and a.project_id = ${key.projectId}
        returning id, name, key_id, application_id, expires_at, revoked_at, last_used_at, created_at
      )
      select i.*, a.name as application_name
      from inserted i join applications a on a.id = i.application_id
    `.execute(this.db);
    return rows[0] ? toApiKey(rows[0], new Date()) : null;
  }

  async revoke(projectId: string, id: string): Promise<ApiKeyDto | null> {
    await this.db
      .updateTable('api_keys')
      .set({ revoked_at: sql<Date>`coalesce(revoked_at, now())` })
      .where('id', '=', id)
      .where('project_id', '=', projectId)
      .execute();
    const row = await this.withApplication()
      .where('k.id', '=', id)
      .where('k.project_id', '=', projectId)
      .executeTakeFirst();
    return row ? toApiKey(row, new Date()) : null;
  }

  async delete(projectId: string, id: string): Promise<string | null> {
    const row = await this.db
      .deleteFrom('api_keys')
      .where('id', '=', id)
      .where('project_id', '=', projectId)
      .returning('key_id')
      .executeTakeFirst();
    return row?.key_id ?? null;
  }
}

export function toApiKey(row: ApiKeyRow, now: Date): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    keyId: row.key_id,
    applicationId: row.application_id,
    applicationName: row.application_name,
    status: apiKeyStatus(
      { revokedAt: row.revoked_at, expiresAt: row.expires_at },
      now,
    ),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}
