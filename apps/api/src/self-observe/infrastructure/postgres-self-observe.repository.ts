import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import { slugify, uniqueSlug } from '../../projects/domain/slug.js';
import {
  SelfObserveRepository,
  type SelfObserveState,
} from '../application/ports.js';
import {
  SELF_APPLICATION_NAME,
  SELF_PROJECT_DESCRIPTION,
  SELF_PROJECT_NAME,
} from '../domain/self-observe.js';

/** The single `self_observe` row (`id = 1`, inserted by migration 0014). */
@Injectable()
export class PostgresSelfObserveRepository extends SelfObserveRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async get(): Promise<SelfObserveState> {
    const row = await this.db
      .selectFrom('self_observe as s')
      .leftJoin('applications as a', 'a.id', 's.application_id')
      .leftJoin('projects as p', 'p.id', 'a.project_id')
      .select([
        's.enabled',
        's.application_id',
        'a.name as application_name',
        'p.slug as project_slug',
        'p.name as project_name',
      ])
      .where('s.id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      enabled: row.enabled,
      applicationId: row.application_id,
      target:
        row.application_name !== null &&
        row.project_slug !== null &&
        row.project_name !== null
          ? {
              projectSlug: row.project_slug,
              projectName: row.project_name,
              applicationName: row.application_name,
            }
          : null,
    };
  }

  async enable(): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // The row lock serializes concurrent enables, so only one creates the project.
      const { application_id } = await trx
        .selectFrom('self_observe')
        .select('application_id')
        .where('id', '=', 1)
        .forUpdate()
        .executeTakeFirstOrThrow();

      let applicationId = application_id;
      if (applicationId === null) {
        const base = slugify(SELF_PROJECT_NAME);
        const taken = await trx
          .selectFrom('projects')
          .select('slug')
          .where((eb) =>
            eb.or([eb('slug', '=', base), eb('slug', '~', `^${base}-[0-9]+$`)]),
          )
          .execute();
        const project = await trx
          .insertInto('projects')
          .values({
            slug: uniqueSlug(base, new Set(taken.map((row) => row.slug))),
            name: SELF_PROJECT_NAME,
            description: SELF_PROJECT_DESCRIPTION,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        // No API key: the collector reports with credentials generated at boot.
        const application = await trx
          .insertInto('applications')
          .values({ project_id: project.id, name: SELF_APPLICATION_NAME })
          .returning('id')
          .executeTakeFirstOrThrow();
        applicationId = application.id;
      }

      await trx
        .updateTable('self_observe')
        .set({ enabled: true, application_id: applicationId })
        .where('id', '=', 1)
        .execute();
    });
  }

  async disable(): Promise<void> {
    await this.db
      .updateTable('self_observe')
      .set({ enabled: false })
      .where('id', '=', 1)
      .execute();
  }
}
