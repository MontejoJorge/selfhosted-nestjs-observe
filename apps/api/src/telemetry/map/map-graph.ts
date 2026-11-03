import type { MapDto, MapEdgeDto, MapNodeDto } from './map.dto.js';

/**
 * Assembles the map from rollup totals and trace-id links (pure, no I/O).
 *
 * - Applications: requests served (`requests_1m`).
 * - Queues: jobs run per queue (`jobs_1m`); queue -> application for the application
 *   that ran them (stated by the job row, not inferred).
 * - Databases and external services: the agent's outbound spans (`span_stats_5m`), whose
 *   class is the driver (`pg`, `mysql2`, `mssql`, `mongodb`) or `http`, with the method
 *   `<METHOD> <host>` for HTTP.
 * - Inferred links: the execution that started each sampled request or job, found by
 *   trace id (the agent propagates it through outbound HTTP and enqueued jobs). A job's
 *   parent enqueued it (application -> queue); a request's parent called it
 *   (application -> application). Requests without a parent came from Clients.
 */

export const CLIENTS_NODE_ID = 'clients';
export const applicationNodeId = (applicationId: string) =>
  `app:${applicationId}`;
export const queueNodeId = (queue: string) => `queue:${queue}`;
export const databaseNodeId = (applicationId: string, system: string) =>
  `database:${applicationId}:${system}`;
export const externalNodeId = (host: string) => `external:${host}`;

/** Outbound span class of each database driver the agent instruments. */
export const DATABASE_SYSTEMS: Readonly<Record<string, string>> = {
  pg: 'PostgreSQL',
  mysql2: 'MySQL',
  mssql: 'SQL Server',
  mongodb: 'MongoDB',
};
export const HTTP_CLASS = 'http';
/** Class names of the outbound spans the map reads. */
export const OUTBOUND_CLASSES = [HTTP_CLASS, ...Object.keys(DATABASE_SYSTEMS)];

export type OutboundTarget =
  | { kind: 'database'; system: string; label: string }
  | { kind: 'external'; host: string };

/** What an outbound span calls, from its class and method; null for other spans. */
export function outboundTarget(
  className: string,
  methodName: string,
): OutboundTarget | null {
  const label = DATABASE_SYSTEMS[className];
  if (label !== undefined)
    return { kind: 'database', system: className, label };
  if (className !== HTTP_CLASS) return null;
  // `<METHOD> <host>`; the host is empty when the agent could not read it.
  const space = methodName.indexOf(' ');
  const host = (space === -1 ? methodName : methodName.slice(space + 1)).trim();
  return { kind: 'external', host: host || 'unknown host' };
}

export interface ApplicationTotals {
  applicationId: string;
  requests: number;
  errors: number;
  sumMs: number;
}

export interface QueueTotals {
  applicationId: string;
  queue: string;
  jobs: number;
  failed: number;
  sumMs: number;
}

export interface OutboundTotals {
  applicationId: string;
  className: string;
  /** `<METHOD> <host>` for HTTP, empty for databases (grouped per system). */
  methodName: string;
  calls: number;
  errors: number;
  totalMs: number;
}

/** Sampled executions grouped by what they are and who started them. */
export interface ExecutionLinks {
  kind: 'request' | 'job';
  applicationId: string;
  /** Jobs only. */
  queue: string | null;
  /** Application of the execution that started it; null when none was found. */
  parentApplicationId: string | null;
  count: number;
  errors: number;
}

export interface MapInput {
  /** Names of the applications in scope. */
  applicationNames: ReadonlyMap<string, string>;
  applications: ApplicationTotals[];
  queues: QueueTotals[];
  outbound: OutboundTotals[];
  links: ExecutionLinks[];
  /** Max sampled executions per kind: reaching it means the links are a sample. */
  sampleLimit: number;
}

interface Tally {
  count: number;
  errors: number;
  sumMs: number;
}

const rate = (errors: number, count: number) =>
  count > 0 ? Math.min(1, Math.max(0, errors / count)) : null;
const avg = (sumMs: number, count: number) =>
  count > 0 ? sumMs / count : null;

function add(
  map: Map<string, Tally>,
  key: string,
  count: number,
  errors: number,
  sumMs = 0,
): void {
  const tally = map.get(key);
  if (tally) {
    tally.count += count;
    tally.errors += errors;
    tally.sumMs += sumMs;
  } else map.set(key, { count, errors, sumMs });
}

/** Scale of a sample: total / sampled once the sample hit its limit, else 1. */
export function sampleScale(
  sampled: number,
  limit: number,
  total: number,
): number {
  return sampled >= limit && sampled > 0 ? Math.max(1, total / sampled) : 1;
}

export function buildMap(input: MapInput): MapDto {
  const nodes = new Map<string, MapNodeDto>();
  const edges = new Map<
    string,
    Tally & { source: string; target: string; inferred: boolean }
  >();
  const addEdge = (
    source: string,
    target: string,
    inferred: boolean,
    count: number,
    errors: number,
  ) => {
    if (count <= 0 || source === target) return;
    const key = JSON.stringify([source, target]);
    const edge = edges.get(key);
    if (edge) {
      edge.count += count;
      edge.errors += errors;
    } else
      edges.set(key, { source, target, count, errors, sumMs: 0, inferred });
  };

  // Applications (requests served).
  const appTotals = new Map<string, Tally>();
  for (const row of input.applications)
    add(appTotals, row.applicationId, row.requests, row.errors, row.sumMs);
  const appsSeen = new Set<string>(appTotals.keys());
  const addApplication = (applicationId: string) => appsSeen.add(applicationId);

  // Queues (jobs run), and queue -> application that ran them.
  const queueTotals = new Map<string, Tally>();
  for (const row of input.queues) {
    add(queueTotals, row.queue, row.jobs, row.failed, row.sumMs);
    addApplication(row.applicationId);
    addEdge(
      queueNodeId(row.queue),
      applicationNodeId(row.applicationId),
      false,
      row.jobs,
      row.failed,
    );
  }

  // Databases (per application and system) and external hosts (shared).
  const databases = new Map<
    string,
    Tally & { applicationId: string; label: string }
  >();
  const externals = new Map<string, Tally & { host: string }>();
  for (const row of input.outbound) {
    const target = outboundTarget(row.className, row.methodName);
    if (!target || row.calls <= 0) continue;
    addApplication(row.applicationId);
    let id: string;
    if (target.kind === 'database') {
      id = databaseNodeId(row.applicationId, target.system);
      const db = databases.get(id) ?? {
        applicationId: row.applicationId,
        label: target.label,
        count: 0,
        errors: 0,
        sumMs: 0,
      };
      databases.set(id, db);
      db.count += row.calls;
      db.errors += row.errors;
      db.sumMs += row.totalMs;
    } else {
      id = externalNodeId(target.host);
      const external = externals.get(id) ?? {
        host: target.host,
        count: 0,
        errors: 0,
        sumMs: 0,
      };
      externals.set(id, external);
      external.count += row.calls;
      external.errors += row.errors;
      external.sumMs += row.totalMs;
    }
    addEdge(
      applicationNodeId(row.applicationId),
      id,
      false,
      row.calls,
      row.errors,
    );
  }

  // Inferred links, scaled up when the sample hit its limit.
  let sampledRequests = 0;
  let sampledJobs = 0;
  for (const link of input.links)
    if (link.kind === 'request') sampledRequests += link.count;
    else sampledJobs += link.count;
  let totalRequests = 0;
  for (const tally of appTotals.values()) totalRequests += tally.count;
  let totalJobs = 0;
  for (const tally of queueTotals.values()) totalJobs += tally.count;
  const requestScale = sampleScale(
    sampledRequests,
    input.sampleLimit,
    totalRequests,
  );
  const jobScale = sampleScale(sampledJobs, input.sampleLimit, totalJobs);

  const calledRequests = new Map<string, Tally>();
  for (const link of input.links) {
    if (link.parentApplicationId === null) continue;
    addApplication(link.parentApplicationId);
    const parent = applicationNodeId(link.parentApplicationId);
    if (link.kind === 'job') {
      if (link.queue === null) continue;
      addEdge(
        parent,
        queueNodeId(link.queue),
        true,
        Math.round(link.count * jobScale),
        Math.round(link.errors * jobScale),
      );
    } else {
      add(
        calledRequests,
        link.applicationId,
        link.count * requestScale,
        link.errors * requestScale,
      );
      addEdge(
        parent,
        applicationNodeId(link.applicationId),
        true,
        Math.round(link.count * requestScale),
        Math.round(link.errors * requestScale),
      );
    }
  }

  // Clients -> application: requests served minus those another execution started.
  let clientCount = 0;
  let clientErrors = 0;
  for (const [applicationId, tally] of appTotals) {
    const called = calledRequests.get(applicationId);
    const count = Math.max(0, Math.round(tally.count - (called?.count ?? 0)));
    const errors = Math.min(
      count,
      Math.max(0, Math.round(tally.errors - (called?.errors ?? 0))),
    );
    clientCount += count;
    clientErrors += errors;
    addEdge(
      CLIENTS_NODE_ID,
      applicationNodeId(applicationId),
      false,
      count,
      errors,
    );
  }

  if (clientCount > 0)
    nodes.set(CLIENTS_NODE_ID, {
      id: CLIENTS_NODE_ID,
      kind: 'client',
      label: 'Inbound traffic',
      applicationId: null,
      count: clientCount,
      unit: 'requests',
      avgMs: null,
      errorRate: rate(clientErrors, clientCount),
    });

  const applicationNodes = [...appsSeen]
    .map((applicationId): MapNodeDto => {
      const tally = appTotals.get(applicationId);
      return {
        id: applicationNodeId(applicationId),
        kind: 'application',
        label: input.applicationNames.get(applicationId) ?? applicationId,
        applicationId,
        count: tally?.count ?? 0,
        unit: 'requests',
        avgMs: tally ? avg(tally.sumMs, tally.count) : null,
        errorRate: tally ? rate(tally.errors, tally.count) : null,
      };
    })
    .sort(byLabel);
  const queueNodes = [...queueTotals]
    .map(([queue, tally]): MapNodeDto => ({
      id: queueNodeId(queue),
      kind: 'queue',
      label: queue,
      applicationId: null,
      count: tally.count,
      unit: 'jobs',
      avgMs: avg(tally.sumMs, tally.count),
      errorRate: rate(tally.errors, tally.count),
    }))
    .sort(byLabel);
  const databaseNodes = [...databases]
    .map(([id, db]): MapNodeDto => ({
      id,
      kind: 'database',
      label: db.label,
      applicationId: db.applicationId,
      count: db.count,
      unit: 'queries',
      avgMs: avg(db.sumMs, db.count),
      errorRate: rate(db.errors, db.count),
    }))
    .sort(byLabel);
  const externalNodes = [...externals]
    .map(([id, external]): MapNodeDto => ({
      id,
      kind: 'external',
      label: external.host,
      applicationId: null,
      count: external.count,
      unit: 'calls',
      avgMs: avg(external.sumMs, external.count),
      errorRate: rate(external.errors, external.count),
    }))
    .sort(byLabel);
  for (const node of [
    ...applicationNodes,
    ...queueNodes,
    ...databaseNodes,
    ...externalNodes,
  ])
    nodes.set(node.id, node);

  const edgeList: MapEdgeDto[] = [];
  for (const edge of edges.values()) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    edgeList.push({
      source: edge.source,
      target: edge.target,
      inferred: edge.inferred,
      count: edge.count,
      errorRate: rate(edge.errors, edge.count),
    });
  }
  edgeList.sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  );

  return {
    nodes: [...nodes.values()],
    edges: edgeList,
    sampled: requestScale > 1 || jobScale > 1,
  };
}

function byLabel(a: MapNodeDto, b: MapNodeDto): number {
  return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}
