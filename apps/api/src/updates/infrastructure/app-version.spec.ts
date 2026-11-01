import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAppVersion } from './app-version.js';

describe('readAppVersion', () => {
  it("reads the API's package.json version", () => {
    const { version } = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(readAppVersion()).toBe(version);
  });
});
