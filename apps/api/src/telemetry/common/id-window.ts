import { uuidV7Timestamp } from '../../ingest/domain/uuid-v7.js';
import type { TimeWindow } from './time-window.js';

/**
 * Execution and log ids are UUIDv7 stamped with the event time, so a lookup by id can
 * also filter on the partition key and touch a single partition.
 */
export function windowFromId(id: string): TimeWindow | null {
  const ms = uuidV7Timestamp(id);
  if (ms === null) return null;
  return { from: new Date(ms - 1000), to: new Date(ms + 1000) };
}
