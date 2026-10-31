import { parseSearch, type SearchSchema } from '@/lib/search';
import { describe, expect, it } from 'vitest';
import { errorListSearch } from './errors/search';
import { jobGroupSearch } from './jobs/search';
import { logsSearch } from './logs/search';
import { operationSearch } from './requests/search';
import { userSearch, usersSearch } from './users/search';

const parse = (schema: SearchSchema, query: string) =>
  parseSearch(schema, new URLSearchParams(query));

/**
 * The page search schemas only send documented values to the API (it rejects unknown
 * or malformed query params), and never fail the page on a bad URL.
 */
describe('feature search schemas', () => {
  it('operationSearch', () => {
    expect(
      parse(
        operationSearch,
        'operationId=GET%20%2Fusers&method=GET&status=error&minDuration=250',
      ),
    ).toEqual({
      operationId: 'GET /users',
      method: 'GET',
      status: 'error',
      minDuration: 250,
    });
    expect(parse(operationSearch, 'status=failed&minDuration=slow')).toEqual({
      operationId: undefined,
      method: undefined,
      status: undefined,
      minDuration: undefined,
    });
  });

  it('jobGroupSearch', () => {
    expect(parse(jobGroupSearch, 'queue=mail&name=send&status=failed')).toEqual(
      { queue: 'mail', name: 'send', status: 'failed' },
    );
    expect(parse(jobGroupSearch, 'status=error').status).toBeUndefined();
  });

  it('logsSearch', () => {
    expect(
      parse(logsSearch, 'level=warn&context=Boot&traceId=abc&q=timeout'),
    ).toEqual({ level: 'warn', context: 'Boot', traceId: 'abc', q: 'timeout' });
    expect(parse(logsSearch, 'level=info').level).toBeUndefined();
    expect(parse(logsSearch, 'level=verbose').level).toBe('verbose');
  });

  it('errorListSearch', () => {
    expect(parse(errorListSearch, 'source=job&q=ECONNRESET')).toEqual({
      source: 'job',
      q: 'ECONNRESET',
    });
    expect(parse(errorListSearch, 'source=cron').source).toBeUndefined();
  });

  it('usersSearch and userSearch', () => {
    expect(parse(usersSearch, 'q=alice')).toEqual({ q: 'alice' });
    expect(parse(userSearch, 'status=ok')).toEqual({ status: 'ok' });
    expect(parse(userSearch, 'status=all')).toEqual({ status: undefined });
  });
});
