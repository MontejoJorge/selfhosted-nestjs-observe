# ADR 0001: Store telemetry in PostgreSQL

- Status: accepted
- Date: 2026-10-28

## Context

`@nestjs/observe` sends one proprietary JSON batch format (see
[protocol.md](../protocol.md)). It is not OTLP. Each batch mixes request and
job executions, each carrying its full span tree, plus logs, runtime metrics,
custom metrics and SLO declarations.

The dashboard we want is an APM rather than a raw trace explorer. Most of its
views are aggregations over executions: p50/p95/p99 and error rate per
operation, failing jobs per queue, error groups with counts and first/last
seen, SLO burn, a service map. Raw trace and log lookups come second.

We considered two options.

1. **PostgreSQL** for everything.
2. **Grafana Tempo** for spans, **Loki** for logs, and something else
   (Postgres or Prometheus/Mimir) for executions, metrics, error groups and SLOs.

## Decision

Use PostgreSQL as the single store, behind repository ports, so a columnar
backend (ClickHouse) can be added later without touching the domain or the
ingest pipeline.

- Time-series tables (`requests`, `jobs`, `spans`, `logs`, `runtime_metrics`,
  `custom_metrics`) are range-partitioned by day. Retention drops whole
  partitions, which is cheap and avoids `DELETE` bloat.
- Span trees are flattened on ingest into `spans` rows with `parent_span_id`
  and `depth`. The original tree is kept as `jsonb` on the execution row, so
  the trace view needs one read.
- Errors are fingerprinted on ingest (class, normalized message, top stack
  frame) into `error_groups`. The issues view never scans raw rows.
- Batches are written with multi-row inserts in a single transaction per batch.

## Consequences

Why not Tempo and Loki:

- Neither speaks this protocol. We would translate to OTLP and still need a
  relational store for error groups, SLOs, releases and service metadata.
  That means three systems to run instead of one, which works against a
  project whose goal is easy self-hosting.
- Tempo is optimized for lookup by trace id and TraceQL search. Per-operation
  percentiles and error rates need metrics-generator plus Prometheus, which
  adds another moving part.
- Our traces are small trees already bounded per execution. We don't need
  Tempo's object-storage economics until volumes are well beyond a typical
  self-hosted NestJS fleet.

Accepted costs:

- At very high volume (tens of millions of spans per day) Postgres
  aggregations get slow. The mitigations are partitioning, BRIN indexes on
  time columns, rollup tables refreshed by the collector, and optionally the
  TimescaleDB extension. ClickHouse is the escape hatch, and the repository
  ports keep it a contained change.
- Full-text log search is limited to `ILIKE`/`pg_trgm`, which is adequate for
  filtering by trace id, level, context and substring.
