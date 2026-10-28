import { randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUIDv7 whose timestamp is the event time (not "now"). Ids sort by time,
 * and the event time can be recovered from the id, which lets lookups by id prune
 * partitions.
 */
export function uuidV7(timestampMs: number): string {
  const bytes = randomBytes(16);
  const ms = Math.max(0, Math.floor(timestampMs));
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Event time encoded in a UUIDv7, or null when `id` is not one. */
export function uuidV7Timestamp(id: string): number | null {
  if (!UUID_V7.test(id)) return null;
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
