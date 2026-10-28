import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsRepository } from './jobs.repository.js';
import { PostgresJobsRepository } from './postgres-jobs.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [JobsController],
  providers: [{ provide: JobsRepository, useClass: PostgresJobsRepository }],
  exports: [JobsRepository],
})
export class JobsModule {}
