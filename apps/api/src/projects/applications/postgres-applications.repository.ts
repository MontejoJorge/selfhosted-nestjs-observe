import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  encodeTextCursor,
  type Page,
  type TextKeysetCursor,
} from '../../telemetry/common/cursor.js';
import { ratio } from '../../telemetry/common/sql.js';
import type { TimeWindow } from '../../telemetry/common/time-window.js';
import { emptyActivity, requestActivity } from '../activity.js';
import type { ApiKeyDto } from '../api-keys/api-keys.dto.js';
import type { NewApiKey } from '../api-keys/api-keys.repository.js';
import { toApiKey } from '../api-keys/postgres-api-keys.repository.js';
import { isUniqueViolation } from '../pg-errors.js';
import type {
  ApplicationDto,
  ApplicationSummaryDto,
} from './applications.dto.js';
import {
  ApplicationNameTakenError,
  ApplicationsRepository,
  type ApplicationPatch,
} from './applications.repository.js';

const COLUMNS = [
  'id',
  'project_id',
  'name',
  'tags',
  'created_at',
  'last_seen_at',
] as const;

interface ApplicationRow {
  id: string;
  project_id: string;
  name: string;
  tags: string[];
  created_at: Date;
  last_seen_at: Date | null;
}

@Injectable()
export class PostgresApplicationsRepository extends ApplicationsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /**
   * Two queries per page, whatever its size: the applications with their latest runtime
   * sample (a LIMIT 1 lateral over the (application_id, sampled_at desc) index of the
   * pruned partitions), then the request buckets of all of them in one aggregate.
   * Names are unique per project, so the keyset is the name alone.
   */
  async list(
    projectId: string,
    window: TimeWindow,
    page: { limit: number; cursor: TextKeysetCursor | null },
  ): Promise<Page<ApplicationSummaryDto>> {
    let query = this.db
      .selectFrom('applications as a')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('runtime_metrics as m')
            .select(['m.cpu_percent', 'm.memory_percent', 'm.memory_rss'])
            .whereRef('m.application_id', '=', 'a.id')
            .where('m.sampled_at', '>=', window.from)
            .where('m.sampled_at', '<', window.to)
            .orderBy('m.sampled_at', 'desc')
            .limit(1)
            .as('rt'),
        (join) => join.onTrue(),
      )
      .select([
        'a.id',
        'a.project_id',
        'a.name',
        'a.tags',
        'a.created_at',
        'a.last_seen_at',
        'rt.cpu_percent',
        'rt.memory_percent',
        'rt.memory_rss',
      ])
      .where('a.project_id', '=', projectId);
    if (page.cursor) query = query.where('a.name', '>', page.cursor.key);
    const rows = await query
      .orderBy('a.name')
      .limit(page.limit + 1)
      .execute();
    const hasMore = rows.length > page.limit;
    const pageRows = hasMore ? rows.slice(0, page.limit) : rows;

    const activity = await requestActivity(
      this.db,
      window,
      pageRows.map((row) => ({ id: row.id, key: row.id })),
    );
    const seconds = (window.to.getTime() - window.from.getTime()) / 1000;

    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => {
        const stats = activity.get(row.id) ?? emptyActivity(window);
        return Object.assign(toApplication(row), {
          requestCount: stats.requestCount,
          requestsPerSecond: stats.requestCount / seconds,
          errorRate: ratio(stats.errorCount, stats.requestCount),
          avgDurationMs: stats.avgDurationMs,
          cpuPercent: row.cpu_percent ?? null,
          memoryPercent: row.memory_percent ?? null,
          memoryRssMb: row.memory_rss ?? null,
          activity: stats.activity,
        });
      }),
      nextCursor:
        hasMore && last
          ? encodeTextCursor({ key: last.name, id: last.id })
          : null,
    };
  }

  async findById(
    projectId: string,
    id: string,
  ): Promise<ApplicationDto | null> {
    const row = await this.db
      .selectFrom('applications')
      .select(COLUMNS)
      .where('id', '=', id)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    return row ? toApplication(row) : null;
  }

  async insert(
    projectId: string,
    application: { name: string; tags: string[] },
    initialKey: Omit<NewApiKey, 'projectId' | 'applicationId'>,
  ): Promise<{ application: ApplicationDto; apiKey: ApiKeyDto }> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto('applications')
          .values({ project_id: projectId, ...application })
          .returning(COLUMNS)
          .executeTakeFirstOrThrow();
        const key = await trx
          .insertInto('api_keys')
          .values({
            project_id: projectId,
            application_id: row.id,
            name: initialKey.name,
            key_id: initialKey.keyId,
            secret_hash: initialKey.secretHash,
            expires_at: initialKey.expiresAt,
          })
          .returning([
            'id',
            'name',
            'key_id',
            'application_id',
            'expires_at',
            'revoked_at',
            'last_used_at',
            'created_at',
          ])
          .executeTakeFirstOrThrow();
        return {
          application: toApplication(row),
          apiKey: toApiKey({ ...key, application_name: row.name }, new Date()),
        };
      });
    } catch (error) {
      throw mapNameTaken(error, application.name);
    }
  }

  async update(
    projectId: string,
    id: string,
    patch: ApplicationPatch,
  ): Promise<ApplicationDto | null> {
    if (patch.name === undefined && patch.tags === undefined)
      return this.findById(projectId, id);
    try {
      const row = await this.db
        .updateTable('applications')
        .set(patch)
        .where('id', '=', id)
        .where('project_id', '=', projectId)
        .returning(COLUMNS)
        .executeTakeFirst();
      return row ? toApplication(row) : null;
    } catch (error) {
      throw mapNameTaken(error, patch.name ?? '');
    }
  }

  async delete(
    projectId: string,
    id: string,
  ): Promise<{ keyIds: string[] } | null> {
    return this.db.transaction().execute(async (trx) => {
      // Read the key ids before the cascade removes them: the auth cache evicts them.
      const keys = await trx
        .selectFrom('api_keys')
        .select('key_id')
        .where('application_id', '=', id)
        .where('project_id', '=', projectId)
        .execute();
      const deleted = await trx
        .deleteFrom('applications')
        .where('id', '=', id)
        .where('project_id', '=', projectId)
        .returning('id')
        .executeTakeFirst();
      if (!deleted) return null;
      await trx
        .insertInto('application_purges')
        .values({ application_id: id })
        .onConflict((oc) => oc.doNothing())
        .execute();
      return { keyIds: keys.map((key) => key.key_id) };
    });
  }
}

function mapNameTaken(error: unknown, name: string): unknown {
  return isUniqueViolation(error, 'applications_project_id_name_key')
    ? new ApplicationNameTakenError(name)
    : error;
}

function toApplication(row: ApplicationRow): ApplicationDto {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    tags: row.tags,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
  };
}
