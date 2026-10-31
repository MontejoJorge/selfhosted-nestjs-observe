import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import type { TelemetryBatchRecord } from '../domain/telemetry.js';
import type { WireTelemetryBatch } from '../domain/wire.js';
import { IngestTelemetryUseCase } from './ingest-telemetry.use-case.js';
import { TelemetryWriter } from './ports.js';

/** In-memory adapter of the output port. */
class FakeTelemetryWriter extends TelemetryWriter {
  readonly batches: TelemetryBatchRecord[] = [];
  failWith: Error | null = null;

  async write(batch: TelemetryBatchRecord): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.batches.push(batch);
  }
}

const config = (retentionDays: number) =>
  ({ get: () => retentionDays }) as unknown as ConfigService<Env, true>;

const NOW = new Date('2026-10-30T12:00:00Z');
const DAY = 86_400_000;
const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';

const requestAt = (date: Date) => ({
  ct: date.toISOString(),
  ti: 'trace',
  op: 'GET /',
  t: [],
});

describe('IngestTelemetryUseCase', () => {
  let writer: FakeTelemetryWriter;
  let useCase: IngestTelemetryUseCase;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    writer = new FakeTelemetryWriter();
    useCase = new IngestTelemetryUseCase(writer, config(14));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the mapped batch once and never asks the agent to degrade', async () => {
    const reply = await useCase.execute(APP, {
      serviceId: 'svc',
      snapshots: [requestAt(NOW)],
    });
    expect(reply).toEqual({ degraded: false });
    expect(writer.batches).toHaveLength(1);
    expect(writer.batches[0]).toMatchObject({
      applicationId: APP,
      service: { serviceId: 'svc', seenAt: NOW },
    });
    expect(writer.batches[0].requests).toHaveLength(1);
  });

  it('drops events older than RETENTION_DAYS', async () => {
    await useCase.execute(APP, {
      serviceId: 'svc',
      snapshots: [
        requestAt(new Date(NOW.getTime() - 14 * DAY - 1)),
        requestAt(new Date(NOW.getTime() - 14 * DAY)),
      ],
    });
    expect(writer.batches[0].requests).toHaveLength(1);
  });

  it('honors a different retention from the config', async () => {
    useCase = new IngestTelemetryUseCase(writer, config(1));
    await useCase.execute(APP, {
      serviceId: 'svc',
      snapshots: [requestAt(new Date(NOW.getTime() - 2 * DAY))],
    });
    expect(writer.batches[0].requests).toEqual([]);
  });

  it('accepts up to one day of clock skew into the future', async () => {
    await useCase.execute(APP, {
      serviceId: 'svc',
      snapshots: [
        requestAt(new Date(NOW.getTime() + DAY)),
        requestAt(new Date(NOW.getTime() + DAY + 1)),
      ],
    });
    expect(writer.batches[0].requests).toHaveLength(1);
  });

  it('still writes a batch with nothing in it (it records the instance)', async () => {
    await useCase.execute(APP, { serviceId: 'svc' } as WireTelemetryBatch);
    expect(writer.batches).toHaveLength(1);
  });

  it('propagates writer failures', async () => {
    writer.failWith = new Error('db down');
    await expect(useCase.execute(APP, { serviceId: 'svc' })).rejects.toThrow(
      'db down',
    );
  });
});
