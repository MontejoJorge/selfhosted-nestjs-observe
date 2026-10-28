import { sql, type Kysely } from 'kysely';

/**
 * Initial schema.
 *
 * Time-series tables are range-partitioned by day on their time column. Only the
 * parents are created here: daily partitions are created ahead of time by
 * `PartitionManager` (on boot, hourly, and on demand during ingest) and dropped
 * after `RETENTION_DAYS`. Indexes declared on a parent are created on every partition.
 *
 * Index choices follow the query API (see apps/api/AGENTS.md):
 * - list endpoints sort by (time desc, id desc) with keyset pagination, so they get
 *   btree indexes on (time desc, id desc), optionally prefixed by an equality filter;
 * - tables that are only aggregated over time ranges get BRIN indexes, which stay tiny
 *   on append-only data;
 * - every query filters on the partition key, so the planner prunes partitions.
 */
const up: string[] = [
  `create table services (
     service_id text primary key,
     service_version text,
     first_seen_at timestamptz not null,
     last_seen_at timestamptz not null
   )`,

  `create table requests (
     id uuid not null,
     called_at timestamptz not null,
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
  `create index requests_called_at_idx on requests (called_at desc, id desc)`,
  `create index requests_service_called_at_idx on requests (service_id, called_at desc, id desc)`,
  `create index requests_operation_called_at_idx on requests (operation_id, called_at desc, id desc)`,
  `create index requests_trace_id_idx on requests (trace_id)`,

  `create table jobs (
     id uuid not null,
     called_at timestamptz not null,
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
  `create index jobs_called_at_idx on jobs (called_at desc, id desc)`,
  `create index jobs_service_called_at_idx on jobs (service_id, called_at desc, id desc)`,
  `create index jobs_queue_name_called_at_idx on jobs (queue, name, called_at desc, id desc)`,
  `create index jobs_trace_id_idx on jobs (trace_id)`,

  `create table spans (
     execution_id uuid not null,
     called_at timestamptz not null,
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
     service_id text not null,
     fingerprint text not null,
     source text not null,
     error_class text,
     message text not null,
     stack text,
     count bigint not null,
     first_seen_at timestamptz not null,
     last_seen_at timestamptz not null,
     unique (service_id, fingerprint)
   )`,
  `create index error_groups_last_seen_idx on error_groups (last_seen_at desc, id desc)`,
  `create index error_groups_service_last_seen_idx on error_groups (service_id, last_seen_at desc, id desc)`,

  `create table error_group_culprits (
     group_id bigint not null references error_groups (id) on delete cascade,
     culprit text not null,
     count bigint not null,
     primary key (group_id, culprit)
   )`,

  `create table error_occurrences (
     group_id bigint not null,
     occurred_at timestamptz not null,
     execution_id uuid not null,
     source text not null,
     service_id text not null,
     trace_id text not null,
     duration_ms double precision not null
   ) partition by range (occurred_at)`,
  `create index error_occurrences_group_idx on error_occurrences (group_id, occurred_at desc)`,
  `create index error_occurrences_occurred_at_brin on error_occurrences using brin (occurred_at)`,

  `create table logs (
     id uuid not null,
     "timestamp" timestamptz not null,
     service_id text not null,
     level text,
     context text,
     text text not null,
     trace_id text,
     span_id text,
     attributes jsonb,
     primary key (id, "timestamp")
   ) partition by range ("timestamp")`,
  `create index logs_timestamp_idx on logs ("timestamp" desc, id desc)`,
  `create index logs_service_timestamp_idx on logs (service_id, "timestamp" desc, id desc)`,
  `create index logs_trace_id_idx on logs (trace_id) where trace_id is not null`,

  `create table runtime_metrics (
     sampled_at timestamptz not null,
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
     gc_breakdown jsonb,
     event_loop_lag_ms double precision,
     event_loop_utilization double precision
   ) partition by range (sampled_at)`,
  `create index runtime_metrics_service_sampled_at_idx on runtime_metrics (service_id, sampled_at)`,

  `create table custom_metrics (
     recorded_at timestamptz not null,
     service_id text not null,
     name text not null,
     type text not null,
     kind text,
     description text,
     value double precision,
     data jsonb not null
   ) partition by range (recorded_at)`,
  `create index custom_metrics_recorded_at_brin on custom_metrics using brin (recorded_at)`,
  `create index custom_metrics_service_name_idx on custom_metrics (service_id, name, recorded_at desc)`,

  `create table objectives (
     service_id text not null,
     operation_id text not null,
     handler text not null,
     method text,
     objectives jsonb not null,
     updated_at timestamptz not null,
     primary key (service_id, operation_id, handler)
   )`,

  `create table profiles (
     id bigint generated always as identity primary key,
     received_at timestamptz not null,
     service_node text,
     sample_rate_hz double precision,
     windows jsonb not null
   )`,
  `create index profiles_received_at_idx on profiles (received_at)`,
];

const down: string[] = [
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
].map((table) => `drop table if exists ${table} cascade`);

export const initialSchema = {
  async up(db: Kysely<unknown>): Promise<void> {
    for (const statement of up) await sql.raw(statement).execute(db);
  },
  async down(db: Kysely<unknown>): Promise<void> {
    for (const statement of down) await sql.raw(statement).execute(db);
  },
};
