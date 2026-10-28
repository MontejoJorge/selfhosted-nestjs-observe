import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  encodeTextCursor,
  UUID_ID,
  type Page,
  type TextKeysetCursor,
} from '../../telemetry/common/cursor.js';
import type { TimeWindow } from '../../telemetry/common/time-window.js';
import { emptyActivity, requestActivity } from '../activity.js';
import { isUniqueViolation } from '../pg-errors.js';
import type { ProjectDto, ProjectSummaryDto } from './projects.dto.js';
import {
  ProjectsRepository,
  SlugTakenError,
  type NewProject,
  type ProjectPatch,
} from './projects.repository.js';

const COLUMNS = [
  'p.id',
  'p.slug',
  'p.name',
  'p.description',
  'p.created_at',
] as const;

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: Date;
  application_count: number;
}

@Injectable()
export class PostgresProjectsRepository extends ProjectsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /** Projects with their application count and last seen, via one lateral aggregate per row. */
  private withStats() {
    return this.db
      .selectFrom('projects as p')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('applications as a')
            .select([
              sql<number>`count(*)::int8`.as('application_count'),
              sql<Date | null>`max(a.last_seen_at)`.as('last_seen_at'),
            ])
            .whereRef('a.project_id', '=', 'p.id')
            .as('stats'),
        (join) => join.onTrue(),
      )
      .select([...COLUMNS, 'stats.application_count', 'stats.last_seen_at']);
  }

  async findByRef(ref: string): Promise<ProjectDto | null> {
    const query = this.withStats();
    const row = await (
      UUID_ID.test(ref)
        ? query.where('p.id', '=', ref)
        : query.where('p.slug', '=', ref)
    ).executeTakeFirst();
    return row
      ? toProject({ ...row, application_count: row.application_count ?? 0 })
      : null;
  }

  async list(
    window: TimeWindow,
    page: { limit: number; cursor: TextKeysetCursor | null },
  ): Promise<Page<ProjectSummaryDto>> {
    let query = this.withStats();
    const { cursor } = page;
    if (cursor) {
      query = query.where((eb) =>
        eb(eb.refTuple('p.name', 'p.id'), '>', eb.tuple(cursor.key, cursor.id)),
      );
    }
    const rows = await query
      .orderBy('p.name')
      .orderBy('p.id')
      .limit(page.limit + 1)
      .execute();
    const hasMore = rows.length > page.limit;
    const pageRows = hasMore ? rows.slice(0, page.limit) : rows;

    const applications =
      pageRows.length === 0
        ? []
        : await this.db
            .selectFrom('applications')
            .select(['id', 'project_id'])
            .where(
              'project_id',
              'in',
              pageRows.map((row) => row.id),
            )
            .execute();
    const activity = await requestActivity(
      this.db,
      window,
      applications.map((app) => ({ id: app.id, key: app.project_id })),
    );

    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => {
        const stats = activity.get(row.id) ?? emptyActivity(window);
        const project = toProject({
          ...row,
          application_count: row.application_count ?? 0,
        });
        return Object.assign(project, {
          lastSeenAt: row.last_seen_at
            ? new Date(row.last_seen_at).toISOString()
            : null,
          requestCount: stats.requestCount,
          avgDurationMs: stats.avgDurationMs,
          activity: stats.activity,
        });
      }),
      nextCursor:
        hasMore && last
          ? encodeTextCursor({ key: last.name, id: last.id })
          : null,
    };
  }

  async slugsLike(base: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('projects')
      .select('slug')
      .where((eb) =>
        eb.or([eb('slug', '=', base), eb('slug', '~', `^${base}-[0-9]+$`)]),
      )
      .execute();
    return new Set(rows.map((row) => row.slug));
  }

  async insert(project: NewProject): Promise<ProjectDto> {
    try {
      const row = await this.db
        .insertInto('projects')
        .values(project)
        .returning(['id', 'slug', 'name', 'description', 'created_at'])
        .executeTakeFirstOrThrow();
      return toProject({ ...row, application_count: 0 });
    } catch (error) {
      if (isUniqueViolation(error, 'projects_slug_key'))
        throw new SlugTakenError(project.slug);
      throw error;
    }
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectDto | null> {
    if (patch.name !== undefined || patch.description !== undefined) {
      const updated = await this.db
        .updateTable('projects')
        .set(patch)
        .where('id', '=', id)
        .executeTakeFirst();
      if (updated.numUpdatedRows === 0n) return null;
    }
    return this.findByRef(id);
  }

  async delete(id: string): Promise<{ keyIds: string[] } | null> {
    return this.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .select('id')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!project) return null;
      const keys = await trx
        .selectFrom('api_keys')
        .select('key_id')
        .where('project_id', '=', id)
        .execute();
      // Queue the telemetry purge in the same transaction as the delete.
      await sql`
        insert into application_purges (application_id)
        select id from applications where project_id = ${id}
        on conflict do nothing
      `.execute(trx);
      await trx.deleteFrom('projects').where('id', '=', id).execute();
      return { keyIds: keys.map((key) => key.key_id) };
    });
  }
}

function toProject(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    applicationCount: row.application_count,
  };
}
