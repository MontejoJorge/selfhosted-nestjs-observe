import { sql, type Kysely } from 'kysely';

/**
 * Projects, applications and API keys, and application-scoped telemetry.
 *
 * DESTRUCTIVE: every telemetry table is dropped and recreated with an `application_id`
 * column. Telemetry stored before this migration has no application to belong to, and the
 * project is pre-release, so that data is discarded instead of being backfilled. Daily
 * partitions are recreated by `PartitionManager` on boot.
 *
 * - `projects` 1-n `applications` 1-n `api_keys`, with cascading foreign keys (small tables).
 * - `api_keys.project_id` is denormalized so a project's keys are one index range; the
 *   composite foreign key on (application_id, project_id) keeps it consistent.
 * - Telemetry rows carry `application_id` without a foreign key: cascading deletes into
 *   day-partitioned tables would be row-by-row. Deleting an application records it in
 *   `application_purges` instead, and maintenance deletes its rows partition by partition.
 *   Queries always filter by the applications of a live project, so pending rows are invisible.
 * - `runtime_metrics` stores the GC breakdown (minor/major/incremental) as typed columns
 *   instead of jsonb, so the series can sum them per bucket.
 * - Indexes lead with `application_id` (equality) followed by the time column (range), so
 *   app-scoped queries are one index range per pruned partition. Lists across a whole project
 *   can also use the plain `(time desc, id desc)` indexes.
 */
const up: string[] = [
  // Telemetry from before projects existed cannot be attributed to an application.
  ...[
    'profiles',
    'objectives',
    'custom_metrics',
    'runtime_metrics',
    'logs',
    'error_occurrences',
    'error_group_culprits',
    'error_groups',
    'spans',
    'jobs',
    'requests',
    'services',
  ].map((table) => `drop table if exists ${table} cascade`),

  `create table projects (
     id uuid primary key default uuidv7(),
     slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
     name text not null check (length(name) between 1 and 100),
     description text check (length(description) <= 500),
     created_at timestamptz not null default now()
   )`,
  `create index projects_name_idx on projects (name, id)`,

  `create table applications (
     id uuid primary key default uuidv7(),
     project_id uuid not null references projects (id) on delete cascade,
     name text not null check (length(name) between 1 and 100),
     tags text[] not null default '{}' check (cardinality(tags) <= 3),
     created_at timestamptz not null default now(),
     last_seen_at timestamptz,
     unique (project_id, name),
     unique (id, project_id)
   )`,

  `create table api_keys (
     id uuid primary key default uuidv7(),
     project_id uuid not null,
     application_id uuid not null,
     name text not null check (length(name) between 1 and 100),
     key_id text not null unique,
     secret_hash bytea not null,
     expires_at timestamptz,
     revoked_at timestamptz,
     last_used_at timestamptz,
     created_at timestamptz not null default now(),
     foreign key (application_id, project_id) references applications (id, project_id) on delete cascade
   )`,
  `create index api_keys_project_created_idx on api_keys (project_id, created_at desc, id desc)`,
  `create index api_keys_application_idx on api_keys (application_id, project_id)`,

  `create table application_purges (
     application_id uuid primary key,
     requested_at timestamptz not null default now()
   )`,

  `create table services (
     application_id uuid not null,
     service_id text not null,
     service_version text,
     first_seen_at timestamptz not null,
     last_seen_at timestamptz not null,
     primary key (application_id, service_id)
   )`,

  `create table requests (
     id uuid not null,
     called_at timestamptz not null,
     application_id uuid not null,
     service_id text not null,
     service_version text,
     trace_id text not null,
     operation_id text not null,
     protocol text not null,
     method text,
     status_code smallint,
     url text,
     duration_ms double precision not null,
     user_id text,
     has_error boolean not null,
     error jsonb,
     tags jsonb,
     request jsonb,
     trace jsonb not null,
     primary key (id, called_at)
   ) partition by range (called_at)`,
  `create index requests_app_called_at_idx on requests (application_id, called_at desc, id desc)`,
  `create index requests_app_operation_called_at_idx on requests (application_id, operation_id, called_at desc, id desc)`,
  `create index requests_called_at_idx on requests (called_at desc, id desc)`,
  `create index requests_trace_id_idx on requests (trace_id)`,

  `create table jobs (
     id uuid not null,
     called_at timestamptz not null,
     application_id uuid not null,
     service_id text not null,
     service_version text,
     job_id text not null,
     trace_id text not null,
     queue text not null,
     name text not null,
     status text,
     duration_ms double precision not null,
     wait_ms double precision,
     attempts_made integer,
     max_attempts integer,
     enqueued_at timestamptz,
     has_error boolean not null,
     error jsonb,
     tags jsonb,
     trace jsonb not null,
     primary key (id, called_at)
   ) partition by range (called_at)`,
  `create index jobs_app_called_at_idx on jobs (application_id, called_at desc, id desc)`,
  `create index jobs_app_queue_name_called_at_idx on jobs (application_id, queue, name, called_at desc, id desc)`,
  `create index jobs_called_at_idx on jobs (called_at desc, id desc)`,
  `create index jobs_trace_id_idx on jobs (trace_id)`,

  `create table spans (
     execution_id uuid not null,
     called_at timestamptz not null,
     application_id uuid not null,
     source text not null,
     service_id text not null,
     trace_id text not null,
     position integer not null,
     parent_position integer,
     depth integer not null,
     span_id text,
     parent_span_id text,
     name text,
     origin text not null,
     class_name text not null,
     method_name text not null,
     duration_ms double precision,
     start_offset_ms double precision,
     has_error boolean not null,
     tags jsonb,
     error jsonb,
     primary key (execution_id, position, called_at)
   ) partition by range (called_at)`,
  `create index spans_called_at_brin on spans using brin (called_at)`,

  `create table error_groups (
     id bigint generated always as identity primary key,
     application_id uuid not null,
     fingerprint text not null,
     source text not null,
     service_id text not null,
     error_class text,
     message text not null,
     stack text,
     count bigint not null,
     first_seen_at timestamptz not null,
     last_seen_at timestamptz not null,
     unique (application_id, fingerprint)
   )`,
  `create index error_groups_app_last_seen_idx on error_groups (application_id, last_seen_at desc, id desc)`,
  `create index error_groups_last_seen_idx on error_groups (last_seen_at desc, id desc)`,

  `create table error_group_culprits (
     group_id bigint not null references error_groups (id) on delete cascade,
     culprit text not null,
     count bigint not null,
     primary key (group_id, culprit)
   )`,

  `create table error_occurrences (
     group_id bigint not null,
     occurred_at timestamptz not null,
     application_id uuid not null,
     execution_id uuid not null,
     source text not null,
     service_id text not null,
     trace_id text not null,
     duration_ms double precision not null
   ) partition by range (occurred_at)`,
  `create index error_occurrences_group_idx on error_occurrences (group_id, occurred_at desc)`,
  `create index error_occurrences_app_occurred_at_idx on error_occurrences (application_id, occurred_at)`,

  `create table logs (
     id uuid not null,
     "timestamp" timestamptz not null,
     application_id uuid not null,
     service_id text not null,
     level text,
     context text,
     text text not null,
     trace_id text,
     span_id text,
     attributes jsonb,
     primary key (id, "timestamp")
   ) partition by range ("timestamp")`,
  `create index logs_app_timestamp_idx on logs (application_id, "timestamp" desc, id desc)`,
  `create index logs_timestamp_idx on logs ("timestamp" desc, id desc)`,
  `create index logs_trace_id_idx on logs (trace_id) where trace_id is not null`,

  `create table runtime_metrics (
     sampled_at timestamptz not null,
     application_id uuid not null,
     service_id text not null,
     cpu_user double precision,
     cpu_system double precision,
     cpu_percent double precision,
     memory_rss double precision,
     heap_total double precision,
     heap_used double precision,
     memory_external double precision,
     array_buffers double precision,
     memory_percent double precision,
     gc_count double precision,
     gc_duration_ms double precision,
     gc_minor_count double precision,
     gc_minor_ms double precision,
     gc_major_count double precision,
     gc_major_ms double precision,
     gc_incremental_count double precision,
     gc_incremental_ms double precision,
     event_loop_lag_ms double precision,
     event_loop_utilization double precision
   ) partition by range (sampled_at)`,
  `create index runtime_metrics_app_sampled_at_idx on runtime_metrics (application_id, sampled_at desc)`,
  `create index runtime_metrics_app_service_sampled_at_idx on runtime_metrics (application_id, service_id, sampled_at desc)`,

  `create table custom_metrics (
     recorded_at timestamptz not null,
     application_id uuid not null,
     service_id text not null,
     name text not null,
     type text not null,
     kind text,
     description text,
     value double precision,
     data jsonb not null
   ) partition by range (recorded_at)`,
  // No query route reads custom metrics yet; this index serves purges and future reads.
  `create index custom_metrics_app_recorded_at_idx on custom_metrics (application_id, recorded_at)`,

  `create table objectives (
     application_id uuid not null,
     operation_id text not null,
     handler text not null,
     service_id text not null,
     method text,
     objectives jsonb not null,
     updated_at timestamptz not null,
     primary key (application_id, operation_id, handler)
   )`,

  `create table profiles (
     id bigint generated always as identity primary key,
     received_at timestamptz not null,
     application_id uuid not null,
     service_node text,
     sample_rate_hz double precision,
     windows jsonb not null
   )`,
  `create index profiles_app_received_at_idx on profiles (application_id, received_at)`,
  `create index profiles_received_at_idx on profiles (received_at)`,
];

export const projectsApplications = {
  async up(db: Kysely<unknown>): Promise<void> {
    for (const statement of up) await sql.raw(statement).execute(db);
  },
  /** Not reversible: the dropped telemetry is gone. Drops the new tables only. */
  async down(db: Kysely<unknown>): Promise<void> {
    for (const table of [
      'application_purges',
      'api_keys',
      'applications',
      'projects',
    ]) {
      await sql.raw(`drop table if exists ${table} cascade`).execute(db);
    }
  },
};
