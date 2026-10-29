import { Module } from '@nestjs/common';
import { ErrorsModule } from './errors/errors.module.js';
import { InstancesModule } from './instances/instances.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LogsModule } from './logs/logs.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { OverviewModule } from './overview/overview.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { TimeBreakdownModule } from './time-breakdown/time-breakdown.module.js';
import { TracesModule } from './traces/traces.module.js';
import { UsersModule } from './users/users.module.js';

/** Read side: the query API consumed by the dashboard, served under /api. */
@Module({
  imports: [
    InstancesModule,
    OverviewModule,
    RequestsModule,
    JobsModule,
    ErrorsModule,
    LogsModule,
    TracesModule,
    MetricsModule,
    UsersModule,
    TimeBreakdownModule,
  ],
})
export class TelemetryModule {}
