import { describe, expect, it } from 'vitest';
import {
  bootSource,
  restartRequired,
  SelfCredentials,
  type StoredSelfObserve,
} from './self-observe.js';

const on: StoredSelfObserve = { enabled: true, applicationId: 'app' };
const off: StoredSelfObserve = { enabled: false, applicationId: 'app' };

describe('bootSource', () => {
  it('prefers env credentials over the switch', () => {
    expect(bootSource({ appKey: 'k', appSecret: 's' }, on)).toBe('env');
    expect(bootSource({ appKey: 'k', appSecret: 's' }, null)).toBe('env');
  });

  it('needs both env credentials', () => {
    expect(bootSource({ appKey: 'k' }, null)).toBe('off');
  });

  it('follows the switch without env credentials', () => {
    expect(bootSource({}, on)).toBe('self');
    expect(bootSource({}, off)).toBe('off');
    // The table is missing (first boot before migrations) or unreadable.
    expect(bootSource({}, null)).toBe('off');
  });

  it('is off while the switch has no application', () => {
    expect(bootSource({}, { enabled: true, applicationId: null })).toBe('off');
  });
});

describe('restartRequired', () => {
  it('is needed when the switch no longer matches the boot', () => {
    expect(restartRequired('off', on)).toBe(true);
    expect(restartRequired('self', off)).toBe(true);
  });

  it('is not needed when they match', () => {
    expect(restartRequired('off', off)).toBe(false);
    expect(restartRequired('self', on)).toBe(false);
  });

  it('is never needed with env credentials', () => {
    expect(restartRequired('env', on)).toBe(false);
    expect(restartRequired('env', off)).toBe(false);
  });
});

describe('SelfCredentials', () => {
  it('matches only its own key and secret', () => {
    const credentials = SelfCredentials.generate();
    const { appKey, appSecret } = credentials;
    expect(credentials.matches(appKey, appSecret)).toBe(true);
    expect(credentials.matches(appKey, `${appSecret}x`)).toBe(false);
    expect(credentials.matches(appKey, undefined)).toBe(false);
    expect(credentials.matches('obs_other', appSecret)).toBe(false);
  });

  it('is different on every boot', () => {
    expect(SelfCredentials.generate().appSecret).not.toBe(
      SelfCredentials.generate().appSecret,
    );
  });
});
