import { Module } from '@nestjs/common';
import { ErrorsModule } from './errors/errors.module.js';
import { InstancesModule } from './instances/instances.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LogsModule } from './logs/logs.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { OverviewModule } from './overview/overview.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { TracesModule } from './traces/traces.module.js';

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
  ],
})
export class TelemetryModule {}
