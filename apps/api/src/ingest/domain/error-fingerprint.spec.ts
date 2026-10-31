import { describe, expect, it } from 'vitest';
import {
  errorFingerprint,
  normalizeErrorMessage,
  topStackFrame,
} from './error-fingerprint.js';

describe('normalizeErrorMessage', () => {
  it('replaces uuids, long hex ids, quoted values and numbers', () => {
    expect(
      normalizeErrorMessage(
        'Order 3b241101-e2bb-4255-8caf-4136c566a962 not found',
      ),
    ).toBe('Order <uuid> not found');
    expect(normalizeErrorMessage('Object 507f1f77bcf86cd799439011 gone')).toBe(
      'Object <hex> gone',
    );
    expect(normalizeErrorMessage('User "bob" and \'alice\' and `x`')).toBe(
      'User <str> and <str> and <str>',
    );
    expect(normalizeErrorMessage('Timeout after 7250ms on id42 (1.5s)')).toBe(
      'Timeout after <n>ms on id<n> (<n>s)',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeErrorMessage('  a \n\t b  ')).toBe('a b');
  });
});

describe('topStackFrame', () => {
  it('returns the first frame without line and column', () => {
    const stack = [
      'Error: boom',
      '    at UsersService.find (/app/dist/users.service.js:42:13)',
      '    at UsersController.get (/app/dist/users.controller.js:10:5)',
    ].join('\n');
    expect(topStackFrame(stack)).toBe(
      'at UsersService.find (/app/dist/users.service.js)',
    );
  });

  it('handles anonymous frames without parentheses', () => {
    expect(topStackFrame('Error\n    at /app/dist/main.js:7:1')).toBe(
      'at /app/dist/main.js',
    );
  });

  it('returns null without a stack or frames', () => {
    expect(topStackFrame(null)).toBeNull();
    expect(topStackFrame(undefined)).toBeNull();
    expect(topStackFrame('')).toBeNull();
    expect(topStackFrame('Error: boom')).toBeNull();
  });
});

describe('errorFingerprint', () => {
  const stack = 'Error\n    at Repo.load (/app/repo.js:10:3)';

  it('groups errors that only differ in volatile values or line numbers', () => {
    const a = errorFingerprint('request', 'NotFound', 'Item 12 missing', stack);
    const b = errorFingerprint(
      'request',
      'NotFound',
      'Item 9999 missing',
      'Error\n    at Repo.load (/app/repo.js:88:21)',
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it('separates sources, classes, messages and top frames', () => {
    const base = errorFingerprint('request', 'E', 'm', stack);
    expect(errorFingerprint('job', 'E', 'm', stack)).not.toBe(base);
    expect(errorFingerprint('request', 'F', 'm', stack)).not.toBe(base);
    expect(errorFingerprint('request', 'E', 'other', stack)).not.toBe(base);
    expect(
      errorFingerprint(
        'request',
        'E',
        'm',
        'Error\n    at Other.fn (x.js:1:1)',
      ),
    ).not.toBe(base);
  });

  it('treats a missing class like an empty one', () => {
    expect(errorFingerprint('job', null, 'm', null)).toBe(
      errorFingerprint('job', '', 'm', null),
    );
  });
});
