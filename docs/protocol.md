# @nestjs/observe wire protocol

Reverse-engineered from the published `@nestjs/observe@0.3.18` package
(`dist/agent/telemetry-wire-contract.js`, `dist/agent/detached-observe-worker.js`,
`dist/encoders/*`, `dist/profiling/profile-uploader.js`). The package ships its
own copy of the contract (`TELEMETRY_BATCH`, `validateTelemetryPayload`), so
re-check it against this document when upgrading.

The protocol is **not OpenTelemetry/OTLP**. It is a compact, single-letter-key
JSON format posted in batches.

## Pointing an app at this collector

```ts
ObserveModule.forRoot({
  serviceId: 'orders-api',
  endpoint: 'http://localhost:3000', // or OBSERVE_ENDPOINT env var
  appKey: process.env.OBSERVE_APP_KEY,
  appSecret: process.env.OBSERVE_APP_SECRET,
});
```

`endpoint` is a base URL without a trailing path. The agent appends the paths
below. When `appKey`/`appSecret` are unset, the headers are omitted. This
collector requires them: create an API key for the application in the dashboard
(or `POST /api/projects/:project/keys`) and use its key id as `appKey` and its
secret as `appSecret`.

## Endpoints

| Method | Path                      | Body                       | Sender                                             |
| ------ | ------------------------- | -------------------------- | -------------------------------------------------- |
| `POST` | `/applications/telemetry` | gzip JSON telemetry batch  | worker thread, every `flushInterval` (default 5 s) |
| `POST` | `/applications/profiles`  | plain JSON profile windows | CPU profiler, about one per minute                 |

### Request headers

| Header                       | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `Content-Type`               | `application/json`                                                            |
| `Content-Encoding`           | `gzip` (telemetry only)                                                       |
| `x-api-key` / `x-api-secret` | credentials, only when both are configured                                    |
| `x-observe-ingest-modes`     | `reduced, trimmed, paced, errors-only` (degraded modes the agent understands) |

Bodies can be large (the agent mentions bodies up to 16 MB), so the collector
must raise the default body-parser limit.

### Responses the agent understands

| Status        | Agent behaviour                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| `2xx`         | Success. The body is optionally parsed as JSON (see below). An empty body is fine. |
| `400`         | The agent sanitizes the batch against its contract and re-sends once.              |
| `401` / `403` | Credentials rejected. Sends back off, up to one attempt per hour.                  |
| `429`         | Sends pause for `Retry-After`, or 5 minutes without one.                           |

An optional `2xx` body tells the agent to degrade:
`{ "degraded": true, "trimmed"?: true, "paced"?: true, "errorsOnly"?: true, "reason"?: "spike" | "budget" }`.
A self-hosted collector normally answers `200 {}` or `200 { "degraded": false }`.

### What this collector does

- `POST /applications/telemetry` inflates gzip (body limit 20 MB) and validates lightly: `serviceId` must be
  a non-empty string of at most 100 characters, and `snapshots`, `jobs`, `custom`, `logs` and `objectives` must be
  arrays and `runtime` an object when present. Anything else is a `400`. Malformed items inside a section
  (for example a snapshot without `ti`/`op`) are skipped, not rejected.
- Both ingest endpoints require the `x-api-key` / `x-api-secret` of an API key. The key belongs to one
  **application** of a project, and every row of the batch is stored under that application. Missing,
  unknown, wrong, expired or revoked credentials give `401` (there is no default application), and the
  agent backs off. Key lookups are cached in memory for 60 s, so revoking a key takes effect at once on
  the API instance that revoked it and within 60 s on other instances.
- `serviceId` is kept as an attribute of the rows (an _instance_ of the application). The same serviceId
  can appear in several applications, for example with one project per environment.
- Runtime samples, the service sighting and profiles are stamped with the time the batch is received.
- Success is always `200 {"degraded": false}`. The collector never asks the agent to degrade.
- Events older than `RETENTION_DAYS`, or more than one day in the future, are dropped silently.
- `POST /applications/profiles` stores the raw windows and answers `200 {}`. It never sends the `403`
  entitlement error, so profiling stays on.

## Telemetry batch

Top level (`TELEMETRY_BATCH`):

| Key              | Type                             | Notes                                       |
| ---------------- | -------------------------------- | ------------------------------------------- |
| `serviceId`      | string, required, max 100        | identifies the service/instance             |
| `serviceVersion` | string, max 50                   | release                                     |
| `truncatedSpans` | number                           | spans dropped by span-collapse              |
| `forwardLogs`    | boolean                          |                                             |
| `snapshots`      | RequestSnapshot[] (max 5000)     | HTTP / RPC / gRPC / GraphQL / WS operations |
| `jobs`           | JobSnapshot[] (max 5000)         | Bull / BullMQ / schedule jobs               |
| `runtime`        | RuntimeMetrics                   | one sample per batch                        |
| `custom`         | CustomMetric[] (max 5000)        | counters, gauges, summaries                 |
| `logs`           | LogEntry[] (max 5000)            | forwarded and redacted logs                 |
| `objectives`     | ObjectiveDeclaration[] (max 100) | SLOs declared with `@Objective()`           |

### RequestSnapshot

| Key  | Meaning                                                                              | Type                          |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------- |
| `ct` | calledAt                                                                             | ISO string                    |
| `ti` | traceId                                                                              | string, required, max 255     |
| `d`  | duration (ms)                                                                        | number                        |
| `p`  | protocol: `http`, `rpc`, `grpc`, `graphql` or `ws`                                   | string                        |
| `op` | operationId (e.g. `GET /orders/:id`)                                                 | string, required              |
| `u`  | userId                                                                               | string                        |
| `tg` | tags                                                                                 | object                        |
| `e`  | error `{ cls?, message, stack?, tags? }`                                             | object                        |
| `rq` | captured request (headers/body, redacted)                                            | object                        |
| `a`  | attributes `{ m: method, sc: statusCode, ou: originalUrl, dop: defaultOperationId }` | object                        |
| `t`  | trace tree (TraceNode[])                                                             | array, required (may be `[]`) |

### JobSnapshot

| Key         | Meaning                         | Type             |
| ----------- | ------------------------------- | ---------------- |
| `i`         | job id                          | string, required |
| `ti`        | traceId                         | string, required |
| `n`         | job name                        | string           |
| `q`         | queue name                      | string           |
| `s`         | status: `completed` or `failed` | string           |
| `c`         | calledAt                        | ISO string       |
| `d`         | duration (ms)                   | number           |
| `ea`        | enqueuedAt                      | ISO string       |
| `wd`        | wait duration (ms)              | number           |
| `am` / `ma` | attempts made / max attempts    | number           |
| `tg`        | tags                            | object           |
| `e`         | error                           | object           |
| `t`         | trace tree                      | array, required  |

### TraceNode (recursive)

| Key  | Meaning                                                    | Type              |
| ---- | ---------------------------------------------------------- | ----------------- |
| `s`  | spanId                                                     | string            |
| `n`  | span name                                                  | string, max 255   |
| `o`  | origin: `manual` or `auto`                                 | string, required  |
| `c`  | class name                                                 | string, required  |
| `m`  | method name                                                | string, required  |
| `d`  | duration (ms)                                              | number            |
| `so` | start offset from the operation start (ms)                 | number            |
| `t`  | tags (outgoing DB/HTTP spans carry statement/url here)     | object            |
| `e`  | error object, or `true` for "failed, details not captured" | object or boolean |
| `ch` | children                                                   | TraceNode[]       |

Spans arrive as a **tree embedded in the operation**, not as flat spans with
parent ids. Every operation is a complete trace.

### RuntimeMetrics

`c` CPU `{ u: user, s: system, p: percent }`, `m` memory
`{ r: rss, ht: heapTotal, hu: heapUsed, e: external, ab: arrayBuffers, p: percent }`,
`g` GC `{ c: count, td: totalDuration, b: { m: minor, j: major, i: incremental } each { count, duration } }`,
`e` event loop `{ l: lag, u: utilization }`.

Units, from `NodeRuntimeMetricsService` (one sample per flush):

| Field                             | Unit                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| memory `r`, `ht`, `hu`, `e`, `ab` | **megabytes** (bytes / 1024 / 1024), not bytes                                            |
| memory `p`                        | percent of total OS memory used by RSS                                                    |
| CPU `u`, `s`                      | ms of CPU time spent **during the interval** (a delta, not cumulative)                    |
| CPU `p`                           | percent of one core over the interval                                                     |
| GC `c`, `td`, breakdown           | **per interval**: the agent resets them after every sample, so summing samples is correct |
| event loop `l`                    | lag (ms)                                                                                  |
| event loop `u`                    | utilization over the interval, 0–1                                                        |

### CustomMetric

`n` name (required, max 100), `t` type (`counter`, `gauge` or `summary`, required),
`v` value, `tg` tags, `d` description, `l` labels (string[]), `lu` lastUpdated,
`k` kind (`additive`, `ratio` or `peak`), `iv` increase (counters), and for
summaries `q50`, `q95`, `q99`, `ct` observations, `sm` total, `mx` maximum.

### LogEntry

`timestamp` (number, required), `text` (required), `traceId`, `spanId`,
`level` (`fatal`, `error`, `warn`, `log`, `debug` or `verbose`), `context`, `attributes`.
Logs are the only section that uses full key names.

### ObjectiveDeclaration

`handler`, `operationId`, `method`, `objectives[]` of
`{ availability?, latency?: { underMs, target }, windowDays?: 7 | 14 | 28 | 30, name? }`.

## Profiles

`POST /applications/profiles` with `{ serviceNode, sampleRateHz, windows: [ProfileWindow] }`.
A window holds folded stacks (`frames: string[]`, `samples: number`) labelled
by span. Answering `403` with an entitlement error makes the agent drop the
window. That is how the hosted collector turns profiling off per plan.
