import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { WireIngestReply } from '@selfhosted-observe/contracts';
import { IngestProfilesUseCase } from '../application/ingest-profiles.use-case.js';
import { IngestTelemetryUseCase } from '../application/ingest-telemetry.use-case.js';
import { IngestAuthGuard } from './ingest-auth.guard.js';
import {
  parseProfilesPayload,
  parseTelemetryBatch,
} from './payload-validation.js';

/**
 * Endpoints called by the @nestjs/observe agent (see docs/protocol.md). They are a
 * contract with a third party: paths and response semantics must not change.
 * Served outside the `/api` prefix.
 */
@Controller('applications')
@UseGuards(IngestAuthGuard)
export class IngestController {
  constructor(
    private readonly ingestTelemetry: IngestTelemetryUseCase,
    private readonly ingestProfiles: IngestProfilesUseCase,
  ) {}

  /** gzip JSON batch; body-parser inflates it based on Content-Encoding. */
  @Post('telemetry')
  @HttpCode(200)
  telemetry(@Body() body: unknown): Promise<WireIngestReply> {
    return this.ingestTelemetry.execute(parseTelemetryBatch(body));
  }

  @Post('profiles')
  @HttpCode(200)
  async profiles(@Body() body: unknown): Promise<Record<string, never>> {
    await this.ingestProfiles.execute(parseProfilesPayload(body));
    return {};
  }
}
