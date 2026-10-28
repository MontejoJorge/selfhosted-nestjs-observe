import { Module } from '@nestjs/common';
import { RequestsModule } from './requests/requests.module.js';
import { ServicesModule } from './services/services.module.js';

/** Read side: the query API consumed by the dashboard, served under /api. */
@Module({
  imports: [ServicesModule, RequestsModule],
})
export class TelemetryModule {}
