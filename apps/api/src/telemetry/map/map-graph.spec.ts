import { describe, expect, it } from 'vitest';
import {
  buildMap,
  outboundTarget,
  sampleScale,
  type MapInput,
} from './map-graph.js';

const API = 'a1';
const WORKER = 'a2';

function input(overrides: Partial<MapInput> = {}): MapInput {
  return {
    applicationNames: new Map([
      [API, 'api'],
      [WORKER, 'worker'],
    ]),
    applications: [],
    queues: [],
    outbound: [],
    links: [],
    sampleLimit: 5000,
    ...overrides,
  };
}

describe('outboundTarget', () => {
  it('maps driver classes to database systems', () => {
    expect(outboundTarget('pg', 'SELECT')).toEqual({
      kind: 'database',
      system: 'pg',
      label: 'PostgreSQL',
    });
    expect(outboundTarget('mongodb', 'find')).toMatchObject({
      label: 'MongoDB',
    });
  });

  it('reads the host from the method of HTTP spans', () => {
    expect(outboundTarget('http', 'GET api.stripe.com')).toEqual({
      kind: 'external',
      host: 'api.stripe.com',
    });
    expect(outboundTarget('http', 'POST localhost:3001')).toEqual({
      kind: 'external',
      host: 'localhost:3001',
    });
    expect(outboundTarget('http', 'GET ')).toEqual({
      kind: 'external',
      host: 'unknown host',
    });
  });

  it('ignores other spans', () => {
    expect(outboundTarget('OrdersService', 'find')).toBeNull();
    expect(outboundTarget('redis', 'get')).toBeNull();
  });
});

describe('sampleScale', () => {
  it('is 1 below the limit and total / sampled at it', () => {
    expect(sampleScale(10, 100, 50)).toBe(1);
    expect(sampleScale(100, 100, 400)).toBe(4);
    expect(sampleScale(0, 0, 10)).toBe(1);
  });
});

describe('buildMap', () => {
  it('is empty without telemetry', () => {
    expect(buildMap(input())).toEqual({ nodes: [], edges: [], sampled: false });
  });

  it('links clients, applications, queues, databases and hosts', () => {
    const map = buildMap(
      input({
        applications: [
          { applicationId: API, requests: 100, errors: 4, sumMs: 2000 },
          { applicationId: WORKER, requests: 10, errors: 0, sumMs: 50 },
        ],
        queues: [
          {
            applicationId: WORKER,
            queue: 'emails',
            jobs: 20,
            failed: 2,
            sumMs: 400,
          },
        ],
        outbound: [
          {
            applicationId: API,
            className: 'pg',
            methodName: '',
            calls: 300,
            errors: 0,
            totalMs: 600,
          },
          {
            applicationId: API,
            className: 'http',
            methodName: 'GET api.stripe.com',
            calls: 5,
            errors: 1,
            totalMs: 500,
          },
          {
            applicationId: WORKER,
            className: 'http',
            methodName: 'POST api.stripe.com',
            calls: 5,
            errors: 0,
            totalMs: 100,
          },
        ],
        links: [
          {
            kind: 'request',
            applicationId: API,
            queue: null,
            parentApplicationId: null,
            count: 100,
            errors: 4,
          },
          {
            kind: 'request',
            applicationId: WORKER,
            queue: null,
            parentApplicationId: API,
            count: 6,
            errors: 0,
          },
          {
            kind: 'request',
            applicationId: WORKER,
            queue: null,
            parentApplicationId: null,
            count: 4,
            errors: 0,
          },
          {
            kind: 'job',
            applicationId: WORKER,
            queue: 'emails',
            parentApplicationId: API,
            count: 18,
            errors: 2,
          },
          {
            kind: 'job',
            applicationId: WORKER,
            queue: 'emails',
            parentApplicationId: null,
            count: 2,
            errors: 0,
          },
        ],
      }),
    );

    expect(map.sampled).toBe(false);
    expect(map.nodes).toEqual([
      {
        id: 'clients',
        kind: 'client',
        label: 'Inbound traffic',
        applicationId: null,
        count: 104,
        unit: 'requests',
        avgMs: null,
        errorRate: 4 / 104,
      },
      {
        id: `app:${API}`,
        kind: 'application',
        label: 'api',
        applicationId: API,
        count: 100,
        unit: 'requests',
        avgMs: 20,
        errorRate: 0.04,
      },
      {
        id: `app:${WORKER}`,
        kind: 'application',
        label: 'worker',
        applicationId: WORKER,
        count: 10,
        unit: 'requests',
        avgMs: 5,
        errorRate: 0,
      },
      {
        id: 'queue:emails',
        kind: 'queue',
        label: 'emails',
        applicationId: null,
        count: 20,
        unit: 'jobs',
        avgMs: 20,
        errorRate: 0.1,
      },
      {
        id: `database:${API}:pg`,
        kind: 'database',
        label: 'PostgreSQL',
        applicationId: API,
        count: 300,
        unit: 'queries',
        avgMs: 2,
        errorRate: 0,
      },
      {
        id: 'external:api.stripe.com',
        kind: 'external',
        label: 'api.stripe.com',
        applicationId: null,
        count: 10,
        unit: 'calls',
        avgMs: 60,
        errorRate: 0.1,
      },
    ]);
    expect(map.edges).toEqual([
      {
        source: `app:${API}`,
        target: `app:${WORKER}`,
        inferred: true,
        count: 6,
        errorRate: 0,
      },
      {
        source: `app:${API}`,
        target: `database:${API}:pg`,
        inferred: false,
        count: 300,
        errorRate: 0,
      },
      {
        source: `app:${API}`,
        target: 'external:api.stripe.com',
        inferred: false,
        count: 5,
        errorRate: 0.2,
      },
      {
        source: `app:${API}`,
        target: 'queue:emails',
        inferred: true,
        count: 18,
        errorRate: 2 / 18,
      },
      {
        source: `app:${WORKER}`,
        target: 'external:api.stripe.com',
        inferred: false,
        count: 5,
        errorRate: 0,
      },
      {
        source: 'clients',
        target: `app:${API}`,
        inferred: false,
        count: 100,
        errorRate: 0.04,
      },
      {
        source: 'clients',
        target: `app:${WORKER}`,
        inferred: false,
        count: 4,
        errorRate: 0,
      },
      {
        source: 'queue:emails',
        target: `app:${WORKER}`,
        inferred: false,
        count: 20,
        errorRate: 0.1,
      },
    ]);
  });

  it('scales the inferred links up when the sample hit its limit', () => {
    const map = buildMap(
      input({
        sampleLimit: 10,
        applications: [
          { applicationId: API, requests: 100, errors: 0, sumMs: 100 },
          { applicationId: WORKER, requests: 100, errors: 10, sumMs: 100 },
        ],
        links: [
          {
            kind: 'request',
            applicationId: WORKER,
            queue: null,
            parentApplicationId: API,
            count: 5,
            errors: 1,
          },
          {
            kind: 'request',
            applicationId: API,
            queue: null,
            parentApplicationId: null,
            count: 5,
            errors: 0,
          },
        ],
      }),
    );
    expect(map.sampled).toBe(true);
    const edge = (source: string, target: string) =>
      map.edges.find((e) => e.source === source && e.target === target);
    expect(edge(`app:${API}`, `app:${WORKER}`)).toMatchObject({
      inferred: true,
      count: 100,
      errorRate: 0.2,
    });
    // Every worker request was called by the api: none come from clients.
    expect(edge('clients', `app:${WORKER}`)).toBeUndefined();
    expect(edge('clients', `app:${API}`)).toMatchObject({ count: 100 });
  });

  it('keeps applications that only run jobs, without request stats', () => {
    const map = buildMap(
      input({
        queues: [
          {
            applicationId: WORKER,
            queue: 'emails',
            jobs: 3,
            failed: 0,
            sumMs: 30,
          },
        ],
      }),
    );
    expect(map.nodes.map((node) => node.id)).toEqual([
      `app:${WORKER}`,
      'queue:emails',
    ]);
    expect(map.nodes[0]).toMatchObject({
      count: 0,
      avgMs: null,
      errorRate: null,
    });
  });

  it('does not draw an application calling itself', () => {
    const map = buildMap(
      input({
        applications: [
          { applicationId: API, requests: 10, errors: 0, sumMs: 10 },
        ],
        links: [
          {
            kind: 'request',
            applicationId: API,
            queue: null,
            parentApplicationId: API,
            count: 2,
            errors: 0,
          },
        ],
      }),
    );
    expect(map.edges).toEqual([
      {
        source: 'clients',
        target: `app:${API}`,
        inferred: false,
        count: 8,
        errorRate: 0,
      },
    ]);
  });
});
