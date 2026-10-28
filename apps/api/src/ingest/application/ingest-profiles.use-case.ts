import { Injectable } from '@nestjs/common';
import { ProfileWriter } from './ports.js';

export interface ProfilesPayload {
  serviceNode?: unknown;
  sampleRateHz?: unknown;
  windows: unknown[];
}

/** Stores raw profile windows. Aggregation into flame graphs is future work. */
@Injectable()
export class IngestProfilesUseCase {
  constructor(private readonly writer: ProfileWriter) {}

  async execute(
    applicationId: string,
    payload: ProfilesPayload,
  ): Promise<void> {
    if (payload.windows.length === 0) return;
    await this.writer.write({
      applicationId,
      receivedAt: new Date(),
      serviceNode:
        typeof payload.serviceNode === 'string' ? payload.serviceNode : null,
      sampleRateHz:
        typeof payload.sampleRateHz === 'number' &&
        Number.isFinite(payload.sampleRateHz)
          ? payload.sampleRateHz
          : null,
      windows: payload.windows,
    });
  }
}
