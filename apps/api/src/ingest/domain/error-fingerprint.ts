import { createHash } from 'node:crypto';
import type { ExecutionSource } from './telemetry.js';

/** Replaces volatile parts of a message (ids, numbers, quoted values) so similar errors group together. */
export function normalizeErrorMessage(message: string): string {
  return (
    message
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<uuid>',
      )
      .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
      .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '<str>')
      // no word boundaries, so '7250ms' or 'id42' normalize too
      .replace(/\d+(\.\d+)?/g, '<n>')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** First `at ...` frame of a V8 stack, without line/column so it survives redeploys. */
export function topStackFrame(stack: string | null | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('at '))
      return trimmed.replace(/:\d+(:\d+)?(\)?)$/, '$2');
  }
  return null;
}

/** Fingerprint = source + error class + normalized message + top stack frame. */
export function errorFingerprint(
  source: ExecutionSource,
  errorClass: string | null,
  message: string,
  stack: string | null,
): string {
  return createHash('sha1')
    .update(
      [
        source,
        errorClass ?? '',
        normalizeErrorMessage(message),
        topStackFrame(stack) ?? '',
      ].join('\n'),
    )
    .digest('hex');
}
