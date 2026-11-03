import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ApiKeyAuthenticator } from '../../projects/api-keys/api-key-authenticator.js';
import {
  SelfObserveRepository,
  type SelfObserveState,
} from '../../self-observe/application/ports.js';
import { SelfObserve } from '../../self-observe/application/self-observe.service.js';
import {
  SelfCredentials,
  type SelfObserveSource,
} from '../../self-observe/domain/self-observe.js';
import { IngestAuthGuard, ingestApplicationName } from './ingest-auth.guard.js';

const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';
const SELF_APP = '0192b8c2-1a2b-7c3d-8e4f-000000000001';
const credentials = SelfCredentials.generate();

class FakeSelfObserveRepository extends SelfObserveRepository {
  constructor(private readonly enabled: boolean) {
    super();
  }
  get(): Promise<SelfObserveState> {
    return Promise.resolve({
      enabled: this.enabled,
      applicationId: SELF_APP,
      target: null,
    });
  }
  enable(): Promise<void> {
    return Promise.resolve();
  }
  disable(): Promise<void> {
    return Promise.resolve();
  }
}

function guard(
  authenticator: ApiKeyAuthenticator,
  source: SelfObserveSource = 'off',
  enabled = source === 'self',
) {
  const selfObserve = new SelfObserve(new FakeSelfObserveRepository(enabled), {
    source,
    credentials,
  });
  return new IngestAuthGuard(authenticator, selfObserve);
}

/** Accepts one key id + secret pair, and records what it was asked. */
function fakeAuthenticator() {
  const calls: Array<[string | undefined, string | undefined]> = [];
  const authenticator = {
    calls,
    async authenticate(keyId: string | undefined, secret: string | undefined) {
      calls.push([keyId, secret]);
      return keyId === 'obs_key' && secret === 'obss_secret'
        ? { id: APP, name: 'orders-api' }
        : null;
    },
  };
  return authenticator as typeof authenticator & ApiKeyAuthenticator;
}

function contextFor(headers: Record<string, string | string[] | undefined>) {
  const request: {
    headers: typeof headers;
    applicationId?: string;
    applicationName?: string;
  } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('IngestAuthGuard', () => {
  it('lets valid credentials through and attaches the application', async () => {
    const authenticator = fakeAuthenticator();
    const { context, request } = contextFor({
      'x-api-key': 'obs_key',
      'x-api-secret': 'obss_secret',
    });
    await expect(guard(authenticator).canActivate(context)).resolves.toBe(true);
    expect(request.applicationId).toBe(APP);
    expect(ingestApplicationName(request as never)).toBe('orders-api');
  });

  it('uses the first value of repeated headers', async () => {
    const authenticator = fakeAuthenticator();
    const { context } = contextFor({
      'x-api-key': ['obs_key', 'obs_other'],
      'x-api-secret': ['obss_secret'],
    });
    await guard(authenticator).canActivate(context);
    expect(authenticator.calls).toEqual([['obs_key', 'obss_secret']]);
  });

  it.each([
    ['missing credentials', {}],
    ['a wrong secret', { 'x-api-key': 'obs_key', 'x-api-secret': 'nope' }],
    ['a missing secret', { 'x-api-key': 'obs_key' }],
  ])('answers 401 for %s', async (_, headers) => {
    const { context, request } = contextFor(headers);
    await expect(
      guard(fakeAuthenticator()).canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.applicationId).toBeUndefined();
    expect(ingestApplicationName(request as never)).toBeUndefined();
  });

  describe('self-observe', () => {
    const selfHeaders = {
      'x-api-key': credentials.appKey,
      'x-api-secret': credentials.appSecret,
    };

    it("attaches the self application to the collector's own credentials", async () => {
      const authenticator = fakeAuthenticator();
      const { context, request } = contextFor(selfHeaders);
      await expect(
        guard(authenticator, 'self').canActivate(context),
      ).resolves.toBe(true);
      expect(request.applicationId).toBe(SELF_APP);
      expect(authenticator.calls).toEqual([]);
    });

    it('answers 401 once the switch is turned off, before the restart', async () => {
      const { context } = contextFor(selfHeaders);
      await expect(
        guard(fakeAuthenticator(), 'self', false).canActivate(context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each<SelfObserveSource>(['off', 'env'])(
      'ignores them when the agent did not boot in self mode (%s)',
      async (source) => {
        const { context } = contextFor(selfHeaders);
        await expect(
          guard(fakeAuthenticator(), source, true).canActivate(context),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      },
    );
  });
});
