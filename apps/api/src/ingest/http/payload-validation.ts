import { BadRequestException } from '@nestjs/common';
import type { ProfilesPayload } from '../application/ingest-profiles.use-case.js';
import type { WireTelemetryBatch } from '../domain/wire.js';

const ARRAY_SECTIONS = [
  'snapshots',
  'jobs',
  'custom',
  'logs',
  'objectives',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Light structural validation of a telemetry batch. A 400 makes the agent sanitize the
 * batch against its own contract and re-send it once, so only reject what we cannot
 * store. Item-level problems are handled by skipping items in the mapper.
 */
export function parseTelemetryBatch(body: unknown): WireTelemetryBatch {
  if (!isRecord(body))
    throw new BadRequestException('Body must be a JSON object');
  const { serviceId } = body;
  if (
    typeof serviceId !== 'string' ||
    serviceId.length === 0 ||
    serviceId.length > 100
  ) {
    throw new BadRequestException(
      'serviceId must be a non-empty string of at most 100 characters',
    );
  }
  for (const section of ARRAY_SECTIONS) {
    if (
      body[section] !== undefined &&
      body[section] !== null &&
      !Array.isArray(body[section])
    ) {
      throw new BadRequestException(`${section} must be an array`);
    }
  }
  if (
    body.runtime !== undefined &&
    body.runtime !== null &&
    !isRecord(body.runtime)
  ) {
    throw new BadRequestException('runtime must be an object');
  }
  if (
    body.serviceVersion !== undefined &&
    body.serviceVersion !== null &&
    typeof body.serviceVersion !== 'string'
  ) {
    throw new BadRequestException('serviceVersion must be a string');
  }
  return body as unknown as WireTelemetryBatch;
}

export function parseProfilesPayload(body: unknown): ProfilesPayload {
  if (!isRecord(body))
    throw new BadRequestException('Body must be a JSON object');
  if (!Array.isArray(body.windows))
    throw new BadRequestException('windows must be an array');
  return {
    serviceNode: body.serviceNode,
    sampleRateHz: body.sampleRateHz,
    windows: body.windows,
  };
}
