import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ApiKeysController } from './api-keys/api-keys.controller.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { ApiKeysRepository } from './api-keys/api-keys.repository.js';
import { ApiKeysService } from './api-keys/api-keys.service.js';
import { PostgresApiKeysRepository } from './api-keys/postgres-api-keys.repository.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { ApplicationsRepository } from './applications/applications.repository.js';
import { ApplicationsService } from './applications/applications.service.js';
import { PostgresApplicationsRepository } from './applications/postgres-applications.repository.js';
import { PostgresProjectsRepository } from './projects/postgres-projects.repository.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsRepository } from './projects/projects.repository.js';
import { ProjectsService } from './projects/projects.service.js';

/**
 * Management API: projects, their applications and the applications' API keys, under
 * /api/projects. No dashboard user auth yet (see the API README).
 */
@Module({
  imports: [ApiKeysModule, MaintenanceModule],
  controllers: [ProjectsController, ApplicationsController, ApiKeysController],
  providers: [
    ProjectsService,
    ApplicationsService,
    ApiKeysService,
    { provide: ProjectsRepository, useClass: PostgresProjectsRepository },
    {
      provide: ApplicationsRepository,
      useClass: PostgresApplicationsRepository,
    },
    { provide: ApiKeysRepository, useClass: PostgresApiKeysRepository },
  ],
})
export class ProjectsModule {}
