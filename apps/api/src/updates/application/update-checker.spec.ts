import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.js';
import { CHECK_INTERVAL_MS } from '../domain/check-schedule.js';
import {
  ReleaseSource,
  UpdateCheckRepository,
  type LatestRelease,
  type UpdateCheckState,
} from './ports.js';
import { UpdateChecker } from './update-checker.js';

class FakeRepository extends UpdateCheckRepository {
  state: UpdateCheckState = {
    enabled: true,
    latest: null,
    checkedAt: null,
    error: null,
  };

  get(): Promise<UpdateCheckState> {
    return Promise.resolve({ ...this.state });
  }

  setEnabled(enabled: boolean): Promise<void> {
    this.state.enabled = enabled;
    return Promise.resolve();
  }

  saveLatest(latest: LatestRelease | null, checkedAt: Date): Promise<void> {
    this.state = { ...this.state, latest, checkedAt, error: null };
    return Promise.resolve();
  }

  saveFailure(error: string, checkedAt: Date): Promise<void> {
    this.state = { ...this.state, checkedAt, error };
    return Promise.resolve();
  }
}

class FakeSource extends ReleaseSource {
  readonly releasesUrl = 'https://example.test/releases';
  calls = 0;
  next: LatestRelease | null | Error = null;

  latest(): Promise<LatestRelease | null> {
    this.calls++;
    const next = this.next;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

const release = (version: string): LatestRelease => ({
  version,
  url: `https://example.test/releases/${version}`,
  publishedAt: new Date('2026-11-01T10:00:00Z'),
});

const config = (updateCheck: boolean) =>
  ({ get: () => updateCheck }) as unknown as ConfigService<Env, true>;

describe('UpdateChecker', () => {
  let repository: FakeRepository;
  let source: FakeSource;
  let checker: UpdateChecker;

  beforeEach(() => {
    repository = new FakeRepository();
    source = new FakeSource();
    checker = new UpdateChecker(repository, source, '1.0.0', config(true));
  });

  it('checks when there was no check yet and reports a newer release', async () => {
    source.next = release('v1.1.0');
    await checker.checkIfDue(new Date());
    expect(source.calls).toBe(1);
    expect(await checker.status()).toMatchObject({
      currentVersion: '1.0.0',
      enabled: true,
      disabledByEnv: false,
      latestVersion: 'v1.1.0',
      latestUrl: 'https://example.test/releases/v1.1.0',
      latestPublishedAt: '2026-11-01T10:00:00.000Z',
      updateAvailable: true,
      releasesUrl: 'https://example.test/releases',
      error: null,
    });
  });

  it('waits 12 hours between checks', async () => {
    const checkedAt = new Date('2026-11-01T00:00:00Z');
    repository.state.checkedAt = checkedAt;
    await checker.checkIfDue(
      new Date(checkedAt.getTime() + CHECK_INTERVAL_MS - 1),
    );
    expect(source.calls).toBe(0);
    await checker.checkIfDue(new Date(checkedAt.getTime() + CHECK_INTERVAL_MS));
    expect(source.calls).toBe(1);
  });

  it('is not an update when the latest release is the running one', async () => {
    source.next = release('v1.0.0');
    await checker.checkIfDue(new Date());
    expect((await checker.status()).updateAvailable).toBe(false);
  });

  it('keeps the previous result and reports the error when a check fails', async () => {
    repository.state.latest = release('v1.1.0');
    source.next = new Error('GitHub answered 503');
    await checker.checkNow();
    expect(await checker.status()).toMatchObject({
      latestVersion: 'v1.1.0',
      error: 'GitHub answered 503',
    });
    expect(repository.state.checkedAt).not.toBeNull();
  });

  it('clears the error on the next successful check', async () => {
    repository.state.error = 'timeout';
    source.next = release('v1.0.0');
    await checker.checkNow();
    expect((await checker.status()).error).toBeNull();
  });

  it('shares one lookup between concurrent checks', async () => {
    await Promise.all([checker.checkNow(), checker.checkNow()]);
    expect(source.calls).toBe(1);
  });

  it('never checks when the switch is off, and hides a stored update', async () => {
    repository.state.latest = release('v2.0.0');
    await checker.setEnabled(false);
    await checker.checkIfDue(new Date());
    expect(source.calls).toBe(0);
    expect(await checker.status()).toMatchObject({
      enabled: false,
      updateAvailable: false,
    });
    await expect(checker.checkNow()).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks right away when the switch is turned on and a check is due', async () => {
    repository.state.enabled = false;
    source.next = release('v1.2.0');
    const status = await checker.setEnabled(true);
    expect(source.calls).toBe(1);
    expect(status).toMatchObject({ enabled: true, updateAvailable: true });
  });

  it('never checks with UPDATE_CHECK=false, whatever the switch says', async () => {
    checker = new UpdateChecker(repository, source, '1.0.0', config(false));
    await checker.checkIfDue(new Date());
    expect(source.calls).toBe(0);
    expect(await checker.status()).toMatchObject({
      enabled: false,
      disabledByEnv: true,
    });
    await expect(checker.setEnabled(true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(checker.checkNow()).rejects.toBeInstanceOf(ConflictException);
  });
});
