import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import type { ApplicationPurger } from '../maintenance/application-purger.js';
import type { StorageTrimmer } from '../maintenance/storage-trimmer.js';
import type { ScopeResolver } from '../telemetry/common/scope.js';
import {
  StorageTrimQueue,
  type StorageRepository,
  type StorageTrim,
} from './storage.repository.js';
import { StorageService } from './storage.service.js';

const PROJECT = 'project-id';

class FakeQueue extends StorageTrimQueue {
  purged: string[][] = [];
  enqueue(): Promise<StorageTrim> {
    throw new Error('not used');
  }
  enqueuePurge(applicationIds: string[]): Promise<void> {
    this.purged.push(applicationIds);
    return Promise.resolve();
  }
}

function setup() {
  const queue = new FakeQueue();
  const purger = {
    triggered: 0,
    trigger() {
      this.triggered++;
    },
  };
  const storage = {
    applicationsOf: () =>
      Promise.resolve([
        { id: 'app-1', name: 'api' },
        { id: 'app-2', name: 'worker' },
      ]),
  } as unknown as StorageRepository;
  const scopes = {
    resolve: () => Promise.resolve({ projectId: PROJECT }),
  } as unknown as ScopeResolver;
  const service = new StorageService(
    storage,
    queue,
    {} as StorageTrimmer,
    purger as unknown as ApplicationPurger,
    scopes,
    { get: () => 14 } as unknown as ConfigService<Env, true>,
  );
  return { service, queue, purger };
}

describe('StorageService.requestPurge', () => {
  it('queues one application and starts the purger', async () => {
    const { service, queue, purger } = setup();
    expect(
      await service.requestPurge('shop', { application: 'app-2' }),
    ).toEqual({ applicationIds: ['app-2'] });
    expect(queue.purged).toEqual([['app-2']]);
    expect(purger.triggered).toBe(1);
  });

  it('queues every application of the project without one', async () => {
    const { service, queue } = setup();
    await service.requestPurge('shop', {});
    expect(queue.purged).toEqual([['app-1', 'app-2']]);
  });
});
