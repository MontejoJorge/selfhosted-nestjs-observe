import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ApiKeyAuthenticator } from '../../projects/api-keys/api-key-authenticator.js';
import { IngestAuthGuard } from './ingest-auth.guard.js';

const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';

/** Accepts one key id + secret pair, and records what it was asked. */
function fakeAuthenticator() {
  const calls: Array<[string | undefined, string | undefined]> = [];
  const authenticator = {
    calls,
    async authenticate(keyId: string | undefined, secret: string | undefined) {
      calls.push([keyId, secret]);
      return keyId === 'obs_key' && secret === 'obss_secret' ? APP : null;
    },
  };
  return authenticator as typeof authenticator & ApiKeyAuthenticator;
}

function contextFor(headers: Record<string, string | string[] | undefined>) {
  const request: { headers: typeof headers; applicationId?: string } = {
    headers,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('IngestAuthGuard', () => {
  it('lets valid credentials through and attaches the application id', async () => {
    const authenticator = fakeAuthenticator();
    const { context, request } = contextFor({
      'x-api-key': 'obs_key',
      'x-api-secret': 'obss_secret',
    });
    await expect(
      new IngestAuthGuard(authenticator).canActivate(context),
    ).resolves.toBe(true);
    expect(request.applicationId).toBe(APP);
  });

  it('uses the first value of repeated headers', async () => {
    const authenticator = fakeAuthenticator();
    const { context } = contextFor({
      'x-api-key': ['obs_key', 'obs_other'],
      'x-api-secret': ['obss_secret'],
    });
    await new IngestAuthGuard(authenticator).canActivate(context);
    expect(authenticator.calls).toEqual([['obs_key', 'obss_secret']]);
  });

  it.each([
    ['missing credentials', {}],
    ['a wrong secret', { 'x-api-key': 'obs_key', 'x-api-secret': 'nope' }],
    ['a missing secret', { 'x-api-key': 'obs_key' }],
  ])('answers 401 for %s', async (_, headers) => {
    const { context, request } = contextFor(headers);
    await expect(
      new IngestAuthGuard(fakeAuthenticator()).canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.applicationId).toBeUndefined();
  });
});
