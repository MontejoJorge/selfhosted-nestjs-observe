import { describe, expect, it } from 'vitest';
import { databaseOptions, validateEnv } from './env.js';

describe('validateEnv', () => {
  it('fills in the documented defaults', () => {
    expect(validateEnv({})).toEqual({
      API_PORT: 3000,
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'observe',
      DATABASE_PASSWORD: 'observe',
      DATABASE_NAME: 'observe',
      DATABASE_POOL_MAX: 10,
      DATABASE_MIGRATE_ON_START: true,
      RETENTION_DAYS: 14,
      AGGREGATE_RETENTION_DAYS: 90,
    });
  });

  it('converts numbers from strings', () => {
    const env = validateEnv({ API_PORT: '8080', RETENTION_DAYS: '30' });
    expect(env.API_PORT).toBe(8080);
    expect(env.RETENTION_DAYS).toBe(30);
  });

  it.each([
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['', true],
  ])('reads DATABASE_MIGRATE_ON_START=%j as %s', (value, expected) => {
    expect(
      validateEnv({ DATABASE_MIGRATE_ON_START: value })
        .DATABASE_MIGRATE_ON_START,
    ).toBe(expected);
  });

  it.each([
    ['a non-numeric port', { API_PORT: 'abc' }],
    ['a port out of range', { DATABASE_PORT: '70000' }],
    ['a zero retention', { RETENTION_DAYS: '0' }],
    ['a fractional pool size', { DATABASE_POOL_MAX: '2.5' }],
    ['an empty host', { DATABASE_HOST: '' }],
    ['an empty dashboard dir', { DASHBOARD_DIR: '' }],
  ])('rejects %s', (_, config) => {
    expect(() => validateEnv(config)).toThrow(/^Invalid environment: /);
  });

  it('keeps optional settings when set', () => {
    const env = validateEnv({
      DASHBOARD_DIR: '/app/web',
      OBSERVE_ENDPOINT: 'http://localhost:3000',
    });
    expect(env.DASHBOARD_DIR).toBe('/app/web');
    expect(env.OBSERVE_ENDPOINT).toBe('http://localhost:3000');
  });
});

describe('databaseOptions', () => {
  it('maps the env to connection settings', () => {
    const env = validateEnv({ DATABASE_HOST: 'db', DATABASE_POOL_MAX: '5' });
    expect(databaseOptions((key) => env[key])).toEqual({
      host: 'db',
      port: 5432,
      user: 'observe',
      password: 'observe',
      database: 'observe',
      poolMax: 5,
    });
  });
});
