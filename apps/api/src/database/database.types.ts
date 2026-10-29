import type { ColumnType, Generated, Kysely } from 'kysely';

/**
 * Typed view of the PostgreSQL schema created by `src/database/migrations`.
 * Keep it in sync with the migrations by hand.
 */

/** jsonb columns: written as JSON strings (pg would turn JS arrays into PG arrays), read as parsed JSON. */
export type Json<T = unknown> = ColumnType<T, string, string>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface ProjectsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ApplicationsTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  tags: ColumnType<string[], string[] | undefined, string[]>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  last_seen_at: Timestamp | null;
}

export interface ApiKeysTable {
  id: Generated<string>;
  project_id: string;
  application_id: string;
  name: string;
  key_id: string;
  secret_hash: Buffer;
  revoked_at: Timestamp | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ApplicationPurgesTable {
  application_id: string;
  requested_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ServicesTable {
  application_id: string;
  service_id: string;
  service_version: string | null;
  first_seen_at: Timestamp;
  last_seen_at: Timestamp;
}

export interface RequestsTable {
  application_id: string;
  id: string;
  called_at: Timestamp;
  service_id: string;
  service_version: string | null;
  trace_id: string;
  operation_id: string;
  protocol: string;
  method: string | null;
  status_code: number | null;
  url: string | null;
  duration_ms: number;
  user_id: string | null;
  has_error: boolean;
  error: Json | null;
  tags: Json | null;
  request: Json | null;
  trace: Json;
}

export interface JobsTable {
  application_id: string;
  id: string;
  called_at: Timestamp;
  service_id: string;
  service_version: string | null;
  job_id: string;
  trace_id: string;
  queue: string;
  name: string;
  status: string | null;
  duration_ms: number;
  wait_ms: number | null;
  attempts_made: number | null;
  max_attempts: number | null;
  enqueued_at: Timestamp | null;
  has_error: boolean;
  error: Json | null;
  tags: Json | null;
  trace: Json;
}

/**
 * Per-minute rollups of `requests` and `jobs`, upserted at ingest (see
 * `ingest/domain/rollups.ts`). Aggregates and timelines read them instead of the raw rows.
 */
export interface RequestsMinuteTable {
  application_id: string;
  minute: Timestamp;
  service_id: string;
  operation_id: string;
  protocol: string;
  /** '' when the request has no method (part of the primary key) */
  method: string;
  count: number;
  errors: number;
  status_4xx: number;
  status_5xx: number;
  sum_ms: number;
  min_ms: number;
  max_ms: number;
  /** latency histogram, see `ingest/domain/latency-histogram.ts` */
  histogram: number[];
  last_called_at: Timestamp;
}

export interface JobsMinuteTable {
  application_id: string;
  minute: Timestamp;
  service_id: string;
  queue: string;
  name: string;
  count: number;
  failed: number;
  sum_ms: number;
  min_ms: number;
  max_ms: number;
  histogram: number[];
  wait_sum_ms: number;
  wait_count: number;
  last_called_at: Timestamp;
}

/**
 * Requests per application, UTC hour and user id (see ADR 0004); `user_id` is `''` for
 * the requests without one. No
 * instance dimension: it would multiply the rows by the instances serving each user.
 */
export interface UsersHourTable {
  application_id: string;
  hour: Timestamp;
  user_id: string;
  count: number;
  errors: number;
  status_4xx: number;
  status_5xx: number;
  sum_ms: number;
  min_ms: number;
  max_ms: number;
  histogram: number[];
  first_called_at: Timestamp;
  last_called_at: Timestamp;
}

/** Identified users active per application and 15-minute bucket (see ADR 0004). */
export interface UserPresenceTable {
  application_id: string;
  bucket: Timestamp;
  user_id: string;
}

/**
 * Spans per application, 5-minute bucket, instance, operation (operationId or
 * `queue/name`) and class method (see ADR 0004), with self time and a reference to the
 * slowest span of the row (`max_*`).
 */
export interface SpanStatsTable {
  application_id: string;
  bucket: Timestamp;
  service_id: string;
  source: string;
  operation: string;
  origin: string;
  class_name: string;
  method_name: string;
  calls: number;
  errors: number;
  total_ms: number;
  self_ms: number;
  min_ms: number;
  max_ms: number;
  histogram: number[];
  max_execution_id: string;
  max_trace_id: string;
  max_called_at: Timestamp;
  max_self_ms: number;
  last_called_at: Timestamp;
}

export interface SpansTable {
  application_id: string;
  execution_id: string;
  called_at: Timestamp;
  source: string;
  service_id: string;
  trace_id: string;
  position: number;
  parent_position: number | null;
  depth: number;
  span_id: string | null;
  parent_span_id: string | null;
  name: string | null;
  origin: string;
  class_name: string;
  method_name: string;
  duration_ms: number | null;
  start_offset_ms: number | null;
  has_error: boolean;
  tags: Json | null;
  error: Json | null;
}

export interface ErrorGroupsTable {
  id: Generated<number>;
  application_id: string;
  fingerprint: string;
  source: string;
  service_id: string;
  error_class: string | null;
  message: string;
  stack: string | null;
  count: ColumnType<number, number, number>;
  first_seen_at: Timestamp;
  last_seen_at: Timestamp;
}

export interface ErrorGroupCulpritsTable {
  group_id: number;
  culprit: string;
  count: number;
}

export interface ErrorOccurrencesTable {
  application_id: string;
  group_id: number;
  occurred_at: Timestamp;
  execution_id: string;
  source: string;
  service_id: string;
  trace_id: string;
  duration_ms: number;
}

export interface LogsTable {
  application_id: string;
  id: string;
  timestamp: Timestamp;
  service_id: string;
  level: string | null;
  context: string | null;
  text: string;
  trace_id: string | null;
  span_id: string | null;
  attributes: Json | null;
}

export interface RuntimeMetricsTable {
  application_id: string;
  sampled_at: Timestamp;
  service_id: string;
  cpu_user: number | null;
  cpu_system: number | null;
  cpu_percent: number | null;
  memory_rss: number | null;
  heap_total: number | null;
  heap_used: number | null;
  memory_external: number | null;
  array_buffers: number | null;
  memory_percent: number | null;
  gc_count: number | null;
  gc_duration_ms: number | null;
  gc_minor_count: number | null;
  gc_minor_ms: number | null;
  gc_major_count: number | null;
  gc_major_ms: number | null;
  gc_incremental_count: number | null;
  gc_incremental_ms: number | null;
  event_loop_lag_ms: number | null;
  event_loop_utilization: number | null;
}

export interface CustomMetricsTable {
  application_id: string;
  recorded_at: Timestamp;
  service_id: string;
  name: string;
  type: string;
  kind: string | null;
  description: string | null;
  value: number | null;
  data: Json;
}

export interface ProfilesTable {
  application_id: string;
  id: Generated<number>;
  received_at: Timestamp;
  service_node: string | null;
  sample_rate_hz: number | null;
  windows: Json;
}

export interface Database {
  projects: ProjectsTable;
  applications: ApplicationsTable;
  api_keys: ApiKeysTable;
  application_purges: ApplicationPurgesTable;
  services: ServicesTable;
  requests: RequestsTable;
  jobs: JobsTable;
  requests_1m: RequestsMinuteTable;
  jobs_1m: JobsMinuteTable;
  users_1h: UsersHourTable;
  user_presence_15m: UserPresenceTable;
  span_stats_5m: SpanStatsTable;
  spans: SpansTable;
  error_groups: ErrorGroupsTable;
  error_group_culprits: ErrorGroupCulpritsTable;
  error_occurrences: ErrorOccurrencesTable;
  logs: LogsTable;
  runtime_metrics: RuntimeMetricsTable;
  custom_metrics: CustomMetricsTable;
  profiles: ProfilesTable;
}

export type Db = Kysely<Database>;

/** Injection token for the shared Kysely instance. */
export const KYSELY = Symbol('KYSELY');

/** Telemetry tables carrying `application_id`, purged when an application is deleted. */
export const APPLICATION_SCOPED_TABLES = [
  'requests',
  'jobs',
  'requests_1m',
  'jobs_1m',
  'users_1h',
  'user_presence_15m',
  'span_stats_5m',
  'spans',
  'error_occurrences',
  'logs',
  'runtime_metrics',
  'custom_metrics',
  'error_groups',
  'services',
  'profiles',
] as const satisfies readonly (keyof Database)[];

/** Day-partitioned tables and their partition key. */
export const PARTITIONED_TABLES = {
  requests: 'called_at',
  jobs: 'called_at',
  spans: 'called_at',
  error_occurrences: 'occurred_at',
  logs: 'timestamp',
  runtime_metrics: 'sampled_at',
  custom_metrics: 'recorded_at',
  requests_1m: 'minute',
  jobs_1m: 'minute',
  users_1h: 'hour',
  user_presence_15m: 'bucket',
  span_stats_5m: 'bucket',
} as const satisfies Partial<Record<keyof Database, string>>;

export type PartitionedTable = keyof typeof PARTITIONED_TABLES;

/** Partitioned tables kept for `AGGREGATE_RETENTION_DAYS` instead of `RETENTION_DAYS`. */
export const ROLLUP_TABLES = [
  'requests_1m',
  'jobs_1m',
  'users_1h',
  'user_presence_15m',
  'span_stats_5m',
] as const satisfies readonly PartitionedTable[];
