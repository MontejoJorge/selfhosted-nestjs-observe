import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { LogsModule } from '../logs/logs.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { TracesController } from './traces.controller.js';

/** Composes the requests, jobs and logs read ports; owns no storage of its own. */
@Module({
  imports: [RequestsModule, JobsModule, LogsModule],
  controllers: [TracesController],
})
export class TracesModule {}
