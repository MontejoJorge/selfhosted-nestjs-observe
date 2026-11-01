# ADR 0009: Self-observe without API keys

- Status: accepted
- Date: 2026-11-01

## Context

The collector runs the `@nestjs/observe` agent on itself, but only with `OBSERVE_APP_KEY` and
`OBSERVE_APP_SECRET`: the operator had to create a project, an application and a key in the
dashboard, copy them to the environment and restart. Watching the ingester should take one switch.

The 0.3.20 agent reads its options once, when its module starts: it can't be turned on, off or
given new credentials while the process runs.

## Decision

**Switch.** Collector settings (`/settings`) has a self-observe switch, off by default
(`GET`/`PATCH /api/self-observe`). Turning it on creates, in one transaction, a project "Observe
collector (self)" (slug `observe-collector-self`, or `-2`... when taken) with an application
"ingester (self)" and **no API key**, unless the stored application still exists. The names say the
telemetry is the ingester's own.

**State.** `self_observe`, a single-row table (`id = 1`, migration 0014): `enabled` and
`application_id`, a foreign key set to null when that application or its project is deleted (turning
the switch on again creates a new one).

**Boot.** Before the agent starts, `SelfObserveSwitchModule` reads the row and decides the source:

- `env` when `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` are set: as before, and the switch is locked
  (409);
- `self` when the switch is on with an application: the agent gets a key and secret generated in
  memory for this process (`SelfCredentials`, never stored or shown) and reports to
  `OBSERVE_ENDPOINT`, or to `http://127.0.0.1:<API_PORT>` when unset;
- `off` otherwise, including a missing table (the read runs before migrations) or an unreachable
  database.

**Ingest.** `IngestAuthGuard` first checks the in-memory credentials (`SelfObserve.applicationFor`):
in self mode, a match reads the row (one primary-key lookup per batch, no cache) and maps the batch to
its application while the switch is on. Anything else goes through the API keys as usual.

**Restarts.** Changes apply on the next start: the status says `restartRequired` when the switch no
longer matches the boot, and the dashboard shows a restart notice. Turning it off stops storing the
collector's batches at once (401: the agent logs one rejection and backs off to one attempt an hour)
until the restart stops the agent. The collector does not restart itself.

## Consequences

- No secret to manage, and no key in the self application's key list.
- Credentials change on every start; another process can't reuse them.
- Deleting the self project while self mode runs stops the reporting (the row's application becomes
  null) until the switch is turned on again and the collector restarted.
