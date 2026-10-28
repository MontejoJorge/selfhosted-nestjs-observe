import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { UUID_ID } from './cursor.js';

/** What a telemetry query may see: the applications of one project, optionally one instance. */
export interface TelemetryScope {
  projectId: string;
  /** Applications in scope (empty when the project has none yet). */
  applicationIds: string[];
  /** The agent's serviceId, when filtering to one instance. */
  instance?: string;
}

export interface ScopeInput {
  project: string;
  application?: string;
  instance?: string;
}

/**
 * Resolves the `project` / `application` query params into application ids, with one
 * indexed query. A project is referenced by id or slug; an application that is not in
 * the project is a 404, so ids from other projects never leak through.
 */
@Injectable()
export class ScopeResolver {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async resolve(input: ScopeInput): Promise<TelemetryScope> {
    let query = this.db
      .selectFrom('projects as p')
      .leftJoin('applications as a', 'a.project_id', 'p.id')
      .select(['p.id as project_id', 'a.id as application_id']);
    query = UUID_ID.test(input.project)
      ? query.where('p.id', '=', input.project)
      : query.where('p.slug', '=', input.project);
    if (input.application) query = query.where('a.id', '=', input.application);
    const rows = await query.execute();

    if (rows.length === 0) {
      // Distinguish an unknown project from an application outside it.
      if (input.application) await this.resolve({ project: input.project });
      throw new NotFoundException(
        input.application
          ? `Application ${input.application} not found in project ${input.project}`
          : `Project ${input.project} not found`,
      );
    }
    return {
      projectId: rows[0].project_id,
      applicationIds: rows
        .map((row) => row.application_id)
        .filter((id): id is string => id !== null),
      instance: input.instance,
    };
  }
}

/**
 * `column` restricted to the scope's applications: `=` for one (the planner sees a plain
 * equality on the leading index column), `in (...)` for several, `false` for none.
 */
export function inApplications(
  column: string,
  applicationIds: readonly string[],
): RawBuilder<SqlBool> {
  if (applicationIds.length === 0) return sql<SqlBool>`false`;
  if (applicationIds.length === 1)
    return sql<SqlBool>`${sql.ref(column)} = ${applicationIds[0]}`;
  return sql<SqlBool>`${sql.ref(column)} in (${sql.join(applicationIds)})`;
}
