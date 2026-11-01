import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  SelfCredentials,
  type SelfObserveSource,
} from '../domain/self-observe.js';
import { SelfObserveRepository, type SelfObserveState } from './ports.js';
import { SelfObserve } from './self-observe.service.js';

class FakeRepository extends SelfObserveRepository {
  state: SelfObserveState = {
    enabled: false,
    applicationId: null,
    target: null,
  };
  created = 0;

  get(): Promise<SelfObserveState> {
    return Promise.resolve({ ...this.state });
  }

  enable(): Promise<void> {
    if (this.state.applicationId === null) {
      this.created++;
      this.state.applicationId = 'self-app';
      this.state.target = {
        projectSlug: 'self',
        projectName: 'Self',
        applicationName: 'collector (self)',
      };
    }
    this.state.enabled = true;
    return Promise.resolve();
  }

  disable(): Promise<void> {
    this.state.enabled = false;
    return Promise.resolve();
  }
}

function setup(source: SelfObserveSource) {
  const repository = new FakeRepository();
  const service = new SelfObserve(repository, {
    source,
    credentials: SelfCredentials.generate(),
  });
  return { repository, service };
}

describe('SelfObserve', () => {
  it('creates the Self project once and asks for a restart to start reporting', async () => {
    const { repository, service } = setup('off');
    expect(await service.setEnabled(true)).toEqual({
      enabled: true,
      source: 'off',
      restartRequired: true,
      projectSlug: 'self',
      projectName: 'Self',
      applicationName: 'collector (self)',
    });
    await service.setEnabled(false);
    await service.setEnabled(true);
    expect(repository.created).toBe(1);
  });

  it('needs no restart when the switch is back where the boot left it', async () => {
    const { service } = setup('off');
    await service.setEnabled(true);
    expect((await service.setEnabled(false)).restartRequired).toBe(false);
  });

  it('asks for a restart to stop the agent after turning it off', async () => {
    const { repository, service } = setup('self');
    await repository.enable();
    expect((await service.status()).restartRequired).toBe(false);
    expect((await service.setEnabled(false)).restartRequired).toBe(true);
  });

  it('leaves env credentials alone', async () => {
    const { service } = setup('env');
    await expect(service.setEnabled(true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await service.status()).source).toBe('env');
  });
});
