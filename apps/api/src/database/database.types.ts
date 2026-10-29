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
} as const satisfies Partial<Record<keyof Database, string>>;

export type PartitionedTable = keyof typeof PARTITIONED_TABLES;
