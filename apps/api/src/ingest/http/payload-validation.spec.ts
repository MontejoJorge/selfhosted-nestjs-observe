import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parseProfilesPayload,
  parseTelemetryBatch,
} from './payload-validation.js';

describe('parseTelemetryBatch', () => {
  it('accepts a minimal batch and returns it unchanged', () => {
    const body = { serviceId: 'svc' };
    expect(parseTelemetryBatch(body)).toBe(body);
  });

  it('accepts a full batch, with null sections', () => {
    expect(() =>
      parseTelemetryBatch({
        serviceId: 'svc',
        serviceVersion: '1.0.0',
        snapshots: [],
        jobs: null,
        custom: [],
        logs: [],
        objectives: [],
        runtime: { c: {} },
      }),
    ).not.toThrow();
  });

  it.each([
    ['an array body', []],
    ['a string body', 'x'],
    ['a null body', null],
  ])('rejects %s', (_, body) => {
    expect(() => parseTelemetryBatch(body)).toThrow(
      new BadRequestException('Body must be a JSON object'),
    );
  });

  it.each([
    ['missing', {}],
    ['empty', { serviceId: '' }],
    ['not a string', { serviceId: 7 }],
    ['longer than 100 characters', { serviceId: 'x'.repeat(101) }],
  ])('rejects a serviceId that is %s', (_, body) => {
    expect(() => parseTelemetryBatch(body)).toThrow(BadRequestException);
  });

  it('accepts a serviceId of exactly 100 characters', () => {
    expect(() =>
      parseTelemetryBatch({ serviceId: 'x'.repeat(100) }),
    ).not.toThrow();
  });

  it.each(['snapshots', 'jobs', 'custom', 'logs', 'objectives'])(
    'rejects a %s section that is not an array',
    (section) => {
      expect(() =>
        parseTelemetryBatch({ serviceId: 'svc', [section]: {} }),
      ).toThrow(`${section} must be an array`);
    },
  );

  it('rejects a non-object runtime and a non-string version', () => {
    expect(() =>
      parseTelemetryBatch({ serviceId: 'svc', runtime: [] }),
    ).toThrow('runtime must be an object');
    expect(() =>
      parseTelemetryBatch({ serviceId: 'svc', serviceVersion: 2 }),
    ).toThrow('serviceVersion must be a string');
  });
});

describe('parseProfilesPayload', () => {
  it('keeps only the known fields', () => {
    expect(
      parseProfilesPayload({
        serviceNode: 'n',
        sampleRateHz: 99,
        windows: [1],
        extra: true,
      }),
    ).toEqual({ serviceNode: 'n', sampleRateHz: 99, windows: [1] });
  });

  it('requires an object with a windows array', () => {
    expect(() => parseProfilesPayload([])).toThrow(BadRequestException);
    expect(() => parseProfilesPayload({})).toThrow('windows must be an array');
    expect(() => parseProfilesPayload({ windows: {} })).toThrow(
      'windows must be an array',
    );
  });
});
