import { beforeEach, describe, expect, it } from 'vitest';
import type { ProfileUpload } from '../domain/telemetry.js';
import { IngestProfilesUseCase } from './ingest-profiles.use-case.js';
import { ProfileWriter } from './ports.js';

class FakeProfileWriter extends ProfileWriter {
  readonly uploads: ProfileUpload[] = [];

  async write(upload: ProfileUpload): Promise<void> {
    this.uploads.push(upload);
  }
}

const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';

describe('IngestProfilesUseCase', () => {
  let writer: FakeProfileWriter;
  let useCase: IngestProfilesUseCase;

  beforeEach(() => {
    writer = new FakeProfileWriter();
    useCase = new IngestProfilesUseCase(writer);
  });

  it('does not write anything for an empty upload', async () => {
    await useCase.execute(APP, { windows: [] });
    expect(writer.uploads).toEqual([]);
  });

  it('stores the raw windows with the node and sample rate', async () => {
    const windows = [{ samples: [1, 2, 3] }];
    await useCase.execute(APP, {
      serviceNode: 'node-1',
      sampleRateHz: 99,
      windows,
    });
    expect(writer.uploads).toHaveLength(1);
    expect(writer.uploads[0]).toMatchObject({
      applicationId: APP,
      serviceNode: 'node-1',
      sampleRateHz: 99,
      windows,
    });
    expect(writer.uploads[0].receivedAt).toBeInstanceOf(Date);
  });

  it('nulls a malformed node or sample rate instead of rejecting', async () => {
    await useCase.execute(APP, {
      serviceNode: 42,
      sampleRateHz: Number.NaN,
      windows: [{}],
    });
    expect(writer.uploads[0]).toMatchObject({
      serviceNode: null,
      sampleRateHz: null,
    });
  });
});
