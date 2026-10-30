import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { IngestModule } from './ingest/ingest.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { SelfObserveModule } from './observe.js';
import { ProjectsModule } from './projects/projects.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // apps/api/.env wins over the root .env (cwd is apps/api under pnpm --filter).
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    // Before ScheduleModule: global modules shut down in reverse order, so the agent
    // still sends what cron jobs finish during shutdown.
    SelfObserveModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    IngestModule,
    ProjectsModule,
    TelemetryModule,
    StorageModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
