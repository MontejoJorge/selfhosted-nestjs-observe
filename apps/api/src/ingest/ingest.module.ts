import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../projects/api-keys/api-keys.module.js';
import { IngestProfilesUseCase } from './application/ingest-profiles.use-case.js';
import { IngestTelemetryUseCase } from './application/ingest-telemetry.use-case.js';
import { ProfileWriter, TelemetryWriter } from './application/ports.js';
import { IngestAuthGuard } from './http/ingest-auth.guard.js';
import { IngestController } from './http/ingest.controller.js';
import { PostgresProfileWriter } from './infrastructure/postgres-profile.writer.js';
import { PostgresTelemetryWriter } from './infrastructure/postgres-telemetry.writer.js';

@Module({
  imports: [ApiKeysModule],
  controllers: [IngestController],
  providers: [
    IngestTelemetryUseCase,
    IngestProfilesUseCase,
    IngestAuthGuard,
    { provide: TelemetryWriter, useClass: PostgresTelemetryWriter },
    { provide: ProfileWriter, useClass: PostgresProfileWriter },
  ],
})
export class IngestModule {}
