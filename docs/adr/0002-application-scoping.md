# ADR 0002: Scope telemetry by project and application

- Status: accepted
- Date: 2026-10-28

## Context

The agent identifies itself with a free-form `serviceId`. The same id is commonly reused across
environments (`orders-api` in production and in staging), so it cannot separate tenants or environments.
The hosted product organizes telemetry as **projects** (often one per environment) that contain
**applications** (one per Nest service), and the agent authenticates with an application's API key.

## Decision

- Projects contain applications; applications own API keys. The agent's `x-api-key` / `x-api-secret`
  identify the application, and every telemetry row stores its `application_id`. Ingest without valid,
  active credentials is a `401`: there is no default application.
- `serviceId` stays as a row attribute and is exposed as an optional `instance` filter.
- Every telemetry query requires a project (by id or slug) and accepts one application. Indexes lead with
  `application_id`, followed by the partition key, so a scoped query is one index range per pruned
  partition.
- Secrets are 32 random bytes, returned once and stored as SHA-256. Key lookups are cached in memory for
  60 s, so ingest does not hit the database per batch for authentication. Keys do not expire and do not
  track their last use (dropped in migration `0003`): a key is active until revoked or deleted.
- Telemetry rows have no foreign key to `applications`. Deleting an application or project records the
  application ids in `application_purges` in the same transaction, and a background purger deletes the
  rows table by table and partition by partition. Deletes return immediately and never hold long locks.
- The migration introducing this drops all existing telemetry (pre-release, disposable data).

## Consequences

- A revoked key keeps working for up to 60 s on API instances other than the one that revoked it.
- Error groups are per application, so the same error in two environments is two groups.
- The query and management API still has no user authentication: deployments must keep it on a private
  network or behind an authenticating proxy (see `apps/api/README.md`).
