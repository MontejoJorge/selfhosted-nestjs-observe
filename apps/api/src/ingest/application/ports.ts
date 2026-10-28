import type {
  ProfileUpload,
  TelemetryBatchRecord,
} from '../domain/telemetry.js';

/**
 * Output ports of the ingest use cases. Abstract classes double as Nest injection
 * tokens. Postgres adapters live in `../infrastructure`; a ClickHouse adapter would
 * implement the same contracts.
 */
export abstract class TelemetryWriter {
  /** Persists the whole batch atomically. */
  abstract write(batch: TelemetryBatchRecord): Promise<void>;
}

export abstract class ProfileWriter {
  abstract write(upload: ProfileUpload): Promise<void>;
}
