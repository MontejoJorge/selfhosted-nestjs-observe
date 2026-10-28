import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  WireIngestReply,
  WireTelemetryBatch,
} from '@selfhosted-observe/contracts';
import type { Env } from '../../config/env.js';
import { mapTelemetryBatch } from '../domain/telemetry-batch.mapper.js';
import { TelemetryWriter } from './ports.js';

const DAY_MS = 86_400_000;
/** Accept events up to this far in the future (agent clock skew). */
const MAX_CLOCK_SKEW_MS = DAY_MS;

@Injectable()
export class IngestTelemetryUseCase {
  private readonly retentionMs: number;

  constructor(
    private readonly writer: TelemetryWriter,
    config: ConfigService<Env, true>,
  ) {
    this.retentionMs = config.get('RETENTION_DAYS', { infer: true }) * DAY_MS;
  }

  async execute(
    applicationId: string,
    batch: WireTelemetryBatch,
  ): Promise<WireIngestReply> {
    const receivedAt = new Date();
    const record = mapTelemetryBatch(applicationId, batch, receivedAt, {
      notBefore: new Date(receivedAt.getTime() - this.retentionMs),
      notAfter: new Date(receivedAt.getTime() + MAX_CLOCK_SKEW_MS),
    });
    await this.writer.write(record);
    // A self-hosted collector never asks the agent to degrade.
    return { degraded: false };
  }
}
