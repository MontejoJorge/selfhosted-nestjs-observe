/** The map: clients, applications, queues, databases and external services, from the generated executions. */

import type {
  MapDto,
  MapEdgeDto,
  MapNodeDto,
  MapNodeKind,
} from '@/lib/api/generated/api';
import { HttpResponse, http } from 'msw';
import { errorResponse, scopeApps, windowOf, within } from '../query';
import { appDef, jobs, requests, spanTimes } from '../store';
import type { SpanTemplate } from '../world';

/** Running totals of a node or an edge. */
interface Tally {
  count: number;
  failed: number;
  totalMs: number;
}

const KIND_ORDER: MapNodeKind[] = [
  'client',
  'application',
  'queue',
  'database',
  'external',
];

const tally = (): Tally => ({ count: 0, failed: 0, totalMs: 0 });

function add(
  map: Map<string, Tally>,
  key: string,
  ms: number,
  failed: boolean,
) {
  const t = map.get(key) ?? tally();
  map.set(key, t);
  t.count += 1;
  t.totalMs += ms;
  if (failed) t.failed += 1;
}

const errorRate = (t: Tally) => (t.count ? t.failed / t.count : null);
const avgMs = (t: Tally) =>
  t.count ? Math.round((t.totalMs / t.count) * 10) / 10 : null;

/** What a span calls outside the application, if anything. */
function target(
  template: SpanTemplate,
): { kind: 'database' | 'external'; label: string } | null {
  const tags = template.tags ?? {};
  if (typeof tags['db.system'] === 'string')
    return {
      kind: 'database',
      label: tags['db.system'] === 'sqlite' ? 'SQLite' : tags['db.system'],
    };
  if (typeof tags['http.url'] === 'string')
    return { kind: 'external', label: new URL(tags['http.url']).host };
  if (typeof tags['smtp.host'] === 'string')
    return { kind: 'external', label: tags['smtp.host'] };
  return null;
}

function buildMap(params: URLSearchParams): MapDto {
  const window = windowOf(params);
  const apps = scopeApps(params);
  const reqs = within(requests, window).filter((r) => apps.has(r.appId));
  const runs = within(jobs, window).filter((j) => apps.has(j.appId));

  const nodes = new Map<string, Tally>();
  const edges = new Map<string, Tally>();
  const meta = new Map<
    string,
    Pick<MapNodeDto, 'kind' | 'label' | 'applicationId' | 'unit'>
  >();
  const inferred = new Set<string>();
  const appNode = (appId: string) => `app:${appId}`;
  const edgeKey = (source: string, target: string) => `${source}>${target}`;

  const visitSpans = (
    appId: string,
    templates: SpanTemplate[],
    durationMs: number,
    failed: boolean,
  ) =>
    spanTimes(templates, durationMs, (template, totalMs) => {
      const called = target(template);
      if (!called) return;
      // Databases belong to their application; an external host is shared.
      const id =
        called.kind === 'database'
          ? `database:${appId}:${called.label}`
          : `external:${called.label}`;
      meta.set(id, {
        kind: called.kind,
        label: called.label,
        applicationId: called.kind === 'database' ? appId : null,
        unit: called.kind === 'database' ? 'queries' : 'calls',
      });
      const spanFailed = failed && template.fails === true;
      add(nodes, id, totalMs, spanFailed);
      add(edges, edgeKey(appNode(appId), id), totalMs, spanFailed);
    });

  const active = new Set([
    ...reqs.map((r) => r.appId),
    ...runs.map((j) => j.appId),
  ]);
  // Like the API, an application counts the requests it served: 0 for job-only ones.
  for (const appId of active) {
    meta.set(appNode(appId), {
      kind: 'application',
      label: appDef(appId)?.name ?? appId,
      applicationId: appId,
      unit: 'requests',
    });
    nodes.set(appNode(appId), tally());
  }

  const traces = new Map<string, string>();
  for (const r of reqs) {
    traces.set(r.traceId, r.appId);
    meta.set('clients', {
      kind: 'client',
      label: 'Inbound traffic',
      applicationId: null,
      unit: 'requests',
    });
    add(nodes, 'clients', r.durationMs, r.hasError);
    add(nodes, appNode(r.appId), r.durationMs, r.hasError);
    add(edges, edgeKey('clients', appNode(r.appId)), r.durationMs, r.hasError);
    visitSpans(r.appId, r.op.spans, r.durationMs, r.hasError);
  }

  for (const j of runs) {
    const queue = `queue:${j.job.queue}`;
    meta.set(queue, {
      kind: 'queue',
      label: j.job.queue,
      applicationId: null,
      unit: 'jobs',
    });
    add(nodes, queue, j.durationMs, j.failed);
    add(edges, edgeKey(queue, appNode(j.appId)), j.durationMs, j.failed);
    const producer = traces.get(j.traceId);
    if (producer) {
      const key = edgeKey(appNode(producer), queue);
      inferred.add(key);
      add(edges, key, j.durationMs, j.failed);
    }
    visitSpans(j.appId, j.job.spans, j.durationMs, j.failed);
  }

  return {
    nodes: [...nodes]
      .map(([id, t]): MapNodeDto => ({
        id,
        ...meta.get(id)!,
        count: t.count,
        // The API has no duration for the Clients node.
        avgMs: id === 'clients' ? null : avgMs(t),
        errorRate: errorRate(t),
      }))
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          a.label.localeCompare(b.label),
      ),
    edges: [...edges]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, t]): MapEdgeDto => {
        const [source, target] = key.split('>') as [string, string];
        return {
          source,
          target,
          inferred: inferred.has(key),
          count: t.count,
          errorRate: errorRate(t),
        };
      }),
    sampled: false,
  };
}

export const mapHandlers = [
  http.get('*/api/map', ({ request }) => {
    try {
      return HttpResponse.json(buildMap(new URL(request.url).searchParams));
    } catch (error) {
      return errorResponse(error);
    }
  }),
];
