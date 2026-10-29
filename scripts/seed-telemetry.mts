/**
 * Seeds realistic, backdated telemetry through the real ingest endpoint, as if an
 * instrumented app (shaped like examples/nest-inventory-api) had been running for days:
 * daily and weekly traffic patterns, latency tails, incidents, a deploy, cron jobs and logs.
 *
 *   pnpm seed --key obs_... --secret obss_... [--days 3] [--requests 300000] [--spans lean]
 *
 * Credentials can also come from SEED_APP_KEY / SEED_APP_SECRET. Run `--help` for every option.
 * Runs on Node 24+ (type stripping), with no dependencies.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';

const gzip = promisify(gzipCallback);

// ---- options ------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    endpoint: { type: 'string', default: 'http://localhost:3000' },
    key: { type: 'string', default: process.env.SEED_APP_KEY },
    secret: { type: 'string', default: process.env.SEED_APP_SECRET },
    days: { type: 'string', default: '3' },
    requests: { type: 'string', default: '300000' },
    spans: { type: 'string', default: 'lean' },
    logs: { type: 'string', default: '0.3' },
    instances: { type: 'string', default: '3' },
    batch: { type: 'string', default: '2000' },
    concurrency: { type: 'string', default: '4' },
    seed: { type: 'string', default: '42' },
    help: { type: 'boolean', default: false },
  },
});

if (args.help) {
  console.log(`Options (defaults in brackets):
  --endpoint     collector base URL [http://localhost:3000]
  --key/--secret the application's API key (or SEED_APP_KEY / SEED_APP_SECRET)
  --days         how far back the data goes, ending now [3]
  --requests     total HTTP requests to generate [300000] (~1.5 GB with lean spans)
  --spans        lean (~5 spans per request) or full (~11, like the real app) [lean]
  --logs         log lines per request, on average [0.3]
  --instances    instances (serviceIds) sharing the traffic [3]
  --batch        requests per POST [2000]
  --concurrency  POSTs in flight [4]
  --seed         random seed, for repeatable data [42]`);
  process.exit(0);
}

const config = {
  endpoint: args.endpoint!.replace(/\/+$/, ''),
  key: args.key,
  secret: args.secret,
  days: Number(args.days),
  requests: Number(args.requests),
  fullSpans: args.spans === 'full',
  logsPerRequest: Number(args.logs),
  instances: Number(args.instances),
  batchSize: Number(args.batch),
  concurrency: Number(args.concurrency),
  seed: Number(args.seed),
};

if (!config.key || !config.secret) {
  console.error('Missing --key/--secret (or SEED_APP_KEY / SEED_APP_SECRET).');
  process.exit(1);
}

// ---- randomness ---------------------------------------------------------------------

/** mulberry32: small seeded PRNG, so the same seed gives the same data. */
let rngState = config.seed >>> 0;
function random(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + random() * (max - min);
const randomInt = (max: number) => Math.floor(random() * max);
const pick = <T,>(items: readonly T[]): T => items[randomInt(items.length)];
const chance = (p: number) => random() < p;

/** Log-normal around `median`: most values near it, with a long right tail. */
function logNormal(median: number, sigma: number): number {
  const u = Math.max(random(), 1e-12);
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  return median * Math.exp(sigma * normal);
}

/** UUIDv7 stamped with `ms`, like the agent's trace and span ids. */
function uuidV7(ms: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---- traffic shape ------------------------------------------------------------------

const MINUTE = 60_000;
const end = Date.now();
const start = end - config.days * 24 * 60 * MINUTE;
const minutes = Math.floor((end - start) / MINUTE);

/** Spain local hour (UTC+1 in winter is close enough for a traffic curve). */
const localHour = (ms: number) =>
  (new Date(ms).getUTCHours() + 1 + new Date(ms).getUTCMinutes() / 60) % 24;
const isWeekend = (ms: number) =>
  [0, 6].includes(new Date(ms + 3_600_000).getUTCDay());
const bump = (hour: number, center: number, width: number) =>
  Math.exp(-((hour - center) ** 2) / (2 * width ** 2));

interface Window {
  from: number;
  to: number;
}

/** Short random spikes, about two a day. */
const spikes: (Window & { factor: number })[] = Array.from(
  { length: Math.ceil(config.days * 2) },
  () => {
    const from = start + random() * (end - start);
    return { from, to: from + between(5, 20) * MINUTE, factor: between(2, 4) };
  },
);

/** Incidents, about one every two days, at daytime: one operation errors and slows down. */
interface Incident extends Window {
  operation: string;
}
const incidents: Incident[] = Array.from(
  { length: Math.max(1, Math.round(config.days / 2)) },
  (_, i) => {
    const day = Math.floor(
      ((i + 0.5) / Math.max(1, Math.round(config.days / 2))) * config.days,
    );
    // From UTC midnight of that day, so 9:00-18:00 local (UTC+1) really is daytime.
    const midnight = Math.floor(start / (24 * 60 * MINUTE)) * 24 * 60 * MINUTE;
    const from =
      midnight + day * 24 * 60 * MINUTE + between(8, 17) * 60 * MINUTE;
    return {
      from,
      to: from + between(20, 40) * MINUTE,
      operation: pick([
        '/users/:id/summary',
        '/pokemon/:name/matchups',
        '/catalog/insights',
      ]),
    };
  },
);

/** A deploy in the second half: the version changes and catalog insights get slower. */
const deployAt = start + between(0.55, 0.75) * (end - start);
const versionAt = (ms: number) => (ms < deployAt ? '1.4.2' : '1.5.0');

const inWindow = (ms: number, windows: Window[]) =>
  windows.find((w) => ms >= w.from && ms < w.to);

/** Relative traffic for a minute: two daily peaks, quiet nights and weekends, drift and spikes. */
let drift = 1;
function weight(ms: number): number {
  const hour = localHour(ms);
  let w =
    0.08 +
    bump(hour, 11, 2.2) +
    0.8 * bump(hour, 17.5, 2) +
    0.25 * bump(hour, 21.5, 1.5);
  if (isWeekend(ms)) w *= 0.45;
  drift = Math.min(1.4, Math.max(0.7, drift + between(-0.03, 0.03)));
  w *= drift * between(0.85, 1.15);
  const spike = inWindow(ms, spikes) as
    (Window & { factor: number }) | undefined;
  if (spike) w *= spike.factor;
  return w;
}

// ---- spans ----------------------------------------------------------------------------

interface Span {
  s: string;
  o: 'auto';
  c: string;
  m: string;
  d: number;
  so: number;
  t?: Record<string, string>;
  e?: WireError;
  ch?: Span[];
}

interface WireError {
  cls: string;
  message: string;
  stack: string;
}

/** A provider method: its own work, an optional outbound HTTP call, or failing. */
interface Step {
  cls: string;
  method: string;
  /** ms of own work */
  work: number;
  http?: { host: string; url: string };
  error?: WireError;
}

/**
 * Lays out nested wrapper spans (`path`, outermost first: e.g. controller then service)
 * whose innermost body runs `stages` in order, each stage's steps in parallel. Returns the
 * tree and the total duration. A failing step ends the call and marks the wrappers.
 */
function buildTrace(
  at: number,
  path: [string, string][],
  stages: Step[][],
  extraLatency: number,
) {
  const id = () => uuidV7(at);
  let cursor = 0.4;
  const children: Span[] = [];
  let failed: WireError | undefined;

  for (const stage of stages) {
    let stageEnd = cursor;
    for (const step of stage) {
      const httpMs = step.http ? logNormal(55, 0.45) * extraLatency : 0;
      const duration = step.work + httpMs + 0.05;
      const span: Span = {
        s: id(),
        o: 'auto',
        c: step.cls,
        m: step.method,
        d: duration,
        so: cursor,
      };
      if (step.http && config.fullSpans) {
        span.ch = [
          {
            s: id(),
            o: 'auto',
            c: 'http',
            m: `GET ${step.http.host}`,
            d: httpMs,
            so: cursor + 0.02,
            t: { 'http.url': step.http.url, 'http.method': 'GET' },
          },
        ];
      }
      if (step.error) {
        span.e = step.error;
        failed = step.error;
      }
      children.push(span);
      stageEnd = Math.max(stageEnd, cursor + duration);
    }
    cursor = stageEnd + 0.02;
    if (failed) break;
  }

  // Wrap from the inside out; each wrapper starts a little earlier than the one it contains.
  let inner = children;
  for (let i = path.length - 1; i >= 0; i--) {
    const so = 0.15 * (i + 1);
    const wrapper: Span = {
      s: id(),
      o: 'auto',
      c: path[i][0],
      m: path[i][1],
      d: cursor - so,
      so,
      ch: inner,
    };
    if (failed) wrapper.e = failed;
    inner = [wrapper];
  }
  const trace: Span[] = [];
  if (config.fullSpans && path.length > 1) {
    trace.push({
      s: id(),
      o: 'auto',
      c: 'ValidationPipe',
      m: 'transform',
      d: 0.07,
      so: 0.03,
    });
  }
  trace.push(...inner);
  return { trace, duration: cursor + 0.2, error: failed };
}

const stack = (cls: string, message: string, frame: string) =>
  `${cls}: ${message}\n    at ${frame}\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at async /app/node_modules/@nestjs/core/router/router-execution-context.js:46:28`;

// ---- operations ---------------------------------------------------------------------

const POKEMON = [
  'pikachu',
  'charizard',
  'bulbasaur',
  'gengar',
  'snorlax',
  'eevee',
  'lucario',
  'gyarados',
  'dragonite',
  'mewtwo',
  'umbreon',
  'garchomp',
];
const CATEGORIES = [
  'smartphones',
  'laptops',
  'tablets',
  'groceries',
  'beauty',
  'furniture',
  'fragrances',
];

interface Generated {
  url: string;
  status: number;
  trace: Span[];
  duration: number;
  error?: WireError;
  logs: { level: 'log' | 'warn' | 'error'; context: string; text: string }[];
}

interface Operation {
  id: string;
  weight: number;
  generate: (at: number, slow: number, broken: boolean) => Generated;
}

const OPERATIONS: Operation[] = [
  {
    id: '/users/:id/summary',
    weight: 4,
    generate(at, slow, broken) {
      const missing = chance(0.02);
      const userId = missing ? 9000 + randomInt(1000) : 1 + randomInt(208);
      const notFound: WireError | undefined = missing
        ? {
            cls: 'NotFoundException',
            message: `User ${userId} not found`,
            stack: stack(
              'NotFoundException',
              `User ${userId} not found`,
              'UsersService.fetchUser (/app/dist/users/users.service.js:32:15)',
            ),
          }
        : broken
          ? {
              cls: 'BadGatewayException',
              message: `Upstream https://dummyjson.com/users/${userId} answered 503`,
              stack: stack(
                'BadGatewayException',
                'Upstream answered 503',
                'getJson (/app/dist/common/http/get-json.js:21:15)',
              ),
            }
          : undefined;
      const dj = (path: string) => ({
        host: 'dummyjson.com',
        url: `https://dummyjson.com${path}`,
      });
      const S = 'UsersService';
      const result = buildTrace(
        at,
        [
          ['UsersController', 'getSummary'],
          [S, 'getSummary'],
        ],
        [
          [
            {
              cls: S,
              method: 'fetchUser',
              work: 0.05,
              http: dj(`/users/${userId}`),
              error: notFound,
            },
          ],
          [
            {
              cls: S,
              method: 'fetchPosts',
              work: 0.08,
              http: dj(`/posts/user/${userId}`),
            },
            {
              cls: S,
              method: 'fetchTodos',
              work: 0.05,
              http: dj(`/todos/user/${userId}`),
            },
            {
              cls: S,
              method: 'fetchCarts',
              work: 0.04,
              http: dj(`/carts/user/${userId}`),
            },
          ],
          [{ cls: S, method: 'buildSummary', work: logNormal(0.4, 0.5) }],
        ],
        slow,
      );
      const status = missing ? 404 : broken ? 502 : 200;
      return {
        url: `/users/${userId}/summary`,
        status,
        ...result,
        logs: missing
          ? [
              {
                level: 'warn',
                context: S,
                text: `User ${userId} not found upstream`,
              },
            ]
          : [
              {
                level: 'log',
                context: S,
                text: `Building summary for user ${userId}`,
              },
            ],
      };
    },
  },
  {
    id: '/pokemon/:name/matchups',
    weight: 3,
    generate(at, slow, broken) {
      const missing = chance(0.015);
      const name = missing ? 'missingno' : pick(POKEMON);
      const error: WireError | undefined = missing
        ? {
            cls: 'NotFoundException',
            message: `Pokemon ${name} not found`,
            stack: stack(
              'NotFoundException',
              `Pokemon ${name} not found`,
              'PokemonService.fetchPokemon (/app/dist/pokemon/pokemon.service.js:31:19)',
            ),
          }
        : broken
          ? {
              cls: 'BadGatewayException',
              message: `Upstream https://pokeapi.co/api/v2/pokemon/${name} answered 504`,
              stack: stack(
                'BadGatewayException',
                'Upstream answered 504',
                'getJson (/app/dist/common/http/get-json.js:21:15)',
              ),
            }
          : undefined;
      const S = 'PokemonService';
      const types = Array.from({ length: 1 + randomInt(2) }, () => ({
        cls: S,
        method: 'fetchType',
        work: 0.03,
        http: {
          host: 'pokeapi.co',
          url: `https://pokeapi.co/api/v2/type/${1 + randomInt(18)}`,
        },
      }));
      const result = buildTrace(
        at,
        [
          ['PokemonController', 'getMatchups'],
          [S, 'getMatchups'],
        ],
        [
          [
            {
              cls: S,
              method: 'fetchPokemon',
              work: 0.06,
              http: {
                host: 'pokeapi.co',
                url: `https://pokeapi.co/api/v2/pokemon/${name}`,
              },
              error,
            },
          ],
          types,
          [{ cls: S, method: 'computeMatchups', work: logNormal(0.25, 0.4) }],
        ],
        slow * 1.4,
      );
      return {
        url: `/pokemon/${name}/matchups`,
        status: missing ? 404 : broken ? 502 : 200,
        ...result,
        logs: [
          {
            level: missing ? 'warn' : 'log',
            context: S,
            text: missing
              ? `Pokemon ${name} not found`
              : `Computing matchups for ${name}`,
          },
        ],
      };
    },
  },
  {
    id: '/catalog/insights',
    weight: 2.5,
    generate(at, slow, broken) {
      const unknown = chance(0.01);
      const timedOut = !unknown && (broken || chance(0.015));
      const categories = [...CATEGORIES]
        .sort(() => random() - 0.5)
        .slice(0, 1 + randomInt(3));
      const S = 'CatalogService';
      const invalid: WireError | undefined = unknown
        ? {
            cls: 'BadRequestException',
            message: 'Unknown categories: spaceships',
            stack: stack(
              'BadRequestException',
              'Unknown categories: spaceships',
              'CatalogService.validateCategories (/app/dist/catalog/catalog.service.js:52:19)',
            ),
          }
        : undefined;
      const timeout: WireError | undefined = timedOut
        ? {
            cls: 'Error',
            message: 'Pricing engine timed out',
            stack: stack(
              'Error',
              'Pricing engine timed out',
              'CatalogService.applyPricingRules (/app/dist/catalog/catalog.service.js:85:13)',
            ),
          }
        : undefined;
      // Release 1.5.0 made pricing slower: a regression to spot after the deploy.
      const pricing =
        between(150, 350) * (versionAt(at) === '1.5.0' ? 1.35 : 1);
      const result = buildTrace(
        at,
        [
          ['CatalogController', 'getInsights'],
          [S, 'getInsights'],
        ],
        [
          [
            {
              cls: S,
              method: 'validateCategories',
              work: 0.04,
              http: {
                host: 'dummyjson.com',
                url: 'https://dummyjson.com/products/category-list',
              },
              error: invalid,
            },
          ],
          categories.map((c) => ({
            cls: S,
            method: 'fetchCategoryProducts',
            work: 0.1,
            http: {
              host: 'dummyjson.com',
              url: `https://dummyjson.com/products/category/${c}`,
            },
          })),
          [{ cls: S, method: 'rankProducts', work: logNormal(0.6, 0.4) }],
          [
            {
              cls: S,
              method: 'applyPricingRules',
              work: pricing,
              error: timeout,
            },
          ],
        ],
        slow,
      );
      const logs: Generated['logs'] = [
        {
          level: 'log',
          context: S,
          text: `Catalog insights for: ${categories.join(', ')}`,
        },
      ];
      if (timedOut)
        logs.push({
          level: 'error',
          context: S,
          text: 'Pricing engine timed out while pricing 24 products',
        });
      return {
        url: `/catalog/insights?categories=${categories.join(',')}`,
        status: unknown ? 400 : timedOut ? 500 : 200,
        ...result,
        logs,
      };
    },
  },
  {
    id: '/',
    weight: 0.5,
    generate(at) {
      const result = buildTrace(
        at,
        [
          ['AppController', 'getHello'],
          ['AppService', 'getHello'],
        ],
        [],
        1,
      );
      return { url: '/', status: 200, ...result, logs: [] };
    },
  },
];

const totalWeight = OPERATIONS.reduce((sum, o) => sum + o.weight, 0);
function pickOperation(): Operation {
  let roll = random() * totalWeight;
  for (const op of OPERATIONS) if ((roll -= op.weight) < 0) return op;
  return OPERATIONS[0];
}

// ---- jobs -----------------------------------------------------------------------------

function featuredPokemonJob(at: number) {
  const S = 'JobsService';
  const fetches = Array.from({ length: 3 + randomInt(3) }, () => ({
    cls: S,
    method: 'fetchPokemon',
    work: 0.05,
    http: {
      host: 'pokeapi.co',
      url: `https://pokeapi.co/api/v2/pokemon/${1 + randomInt(151)}`,
    },
  }));
  const { trace, duration } = buildTrace(
    at,
    [[S, 'refreshFeaturedPokemon']],
    [fetches, [{ cls: S, method: 'rankByStats', work: 0.1 }]],
    1.6,
  );
  return {
    i: uuidV7(at),
    ti: uuidV7(at),
    n: 'featured-pokemon',
    q: 'cron',
    s: 'completed',
    c: new Date(at).toISOString(),
    d: duration,
    t: trace,
  };
}

function reconcileJob(at: number) {
  const S = 'JobsService';
  const failed = chance(0.2);
  const error: WireError | undefined = failed
    ? {
        cls: 'Error',
        message: 'Warehouse API timed out',
        stack: stack(
          'Error',
          'Warehouse API timed out',
          'JobsService.persistReport (/app/dist/jobs/jobs.service.js:74:19)',
        ),
      }
    : undefined;
  const { trace, duration } = buildTrace(
    at,
    [[S, 'reconcileInventory']],
    [
      [
        {
          cls: S,
          method: 'fetchProductsPage',
          work: 0.1,
          http: {
            host: 'dummyjson.com',
            url: `https://dummyjson.com/products?limit=30&skip=${randomInt(150)}`,
          },
        },
      ],
      [{ cls: S, method: 'findLowStock', work: 0.05 }],
      [{ cls: S, method: 'persistReport', work: between(200, 1000), error }],
    ],
    1,
  );
  return {
    i: uuidV7(at),
    ti: uuidV7(at),
    n: 'inventory-reconcile',
    q: 'cron',
    s: failed ? 'failed' : 'completed',
    c: new Date(at).toISOString(),
    d: duration,
    t: trace,
    ...(error ? { e: error } : {}),
  };
}

// ---- batching and sending -------------------------------------------------------------

interface Batch {
  serviceId: string;
  serviceVersion: string;
  snapshots: unknown[];
  jobs: unknown[];
  logs: unknown[];
}

const instanceIds = Array.from(
  { length: config.instances },
  (_, i) => `nest-inventory-api-${i + 1}`,
);
const pending = new Map<string, Batch>();
const inFlight = new Set<Promise<void>>();
const stats = { requests: 0, jobs: 0, logs: 0, batches: 0, bytes: 0 };
const startedAt = Date.now();

async function post(batch: Batch): Promise<void> {
  const body = await gzip(JSON.stringify(batch));
  stats.bytes += body.length;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(
        `${config.endpoint}/applications/telemetry`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
            'x-api-key': config.key!,
            'x-api-secret': config.secret!,
          },
          body,
        },
      );
      if (response.ok) return;
      const text = await response.text();
      if (response.status < 500 || attempt >= 5)
        throw new Error(
          `Ingest answered ${response.status}: ${text.slice(0, 200)}`,
        );
    } catch (error) {
      if (attempt >= 5) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

async function send(batch: Batch): Promise<void> {
  while (inFlight.size >= config.concurrency) await Promise.race(inFlight);
  const promise = post(batch).finally(() => inFlight.delete(promise));
  inFlight.add(promise);
  stats.batches++;
}

function batchFor(serviceId: string, version: string): Batch {
  const key = `${serviceId}@${version}`;
  let batch = pending.get(key);
  if (!batch) {
    batch = {
      serviceId,
      serviceVersion: version,
      snapshots: [],
      jobs: [],
      logs: [],
    };
    pending.set(key, batch);
  }
  return batch;
}

async function flush(force = false): Promise<void> {
  for (const [key, batch] of pending) {
    if (force || batch.snapshots.length >= config.batchSize) {
      pending.delete(key);
      if (batch.snapshots.length + batch.jobs.length + batch.logs.length > 0)
        await send(batch);
    }
  }
}

function report(minute: number): void {
  const seconds = (Date.now() - startedAt) / 1000;
  const pct = ((minute / minutes) * 100).toFixed(1);
  console.log(
    `${pct}%  ${stats.requests.toLocaleString()} requests, ${stats.jobs.toLocaleString()} jobs, ${stats.logs.toLocaleString()} logs in ${stats.batches} batches (${(stats.bytes / 1e6).toFixed(0)} MB gzip), ${Math.round(stats.requests / seconds).toLocaleString()} req/s`,
  );
}

// ---- main -----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `Seeding ${config.requests.toLocaleString()} requests over ${config.days} days into ${config.endpoint} (${config.fullSpans ? 'full' : 'lean'} spans, deploy 1.4.2 -> 1.5.0 at ${new Date(deployAt).toISOString()})`,
  );
  for (const incident of incidents)
    console.log(
      `  incident on ${incident.operation} at ${new Date(incident.from).toISOString()}`,
    );

  const weights = Array.from({ length: minutes }, (_, m) =>
    weight(start + m * MINUTE),
  );
  const scale = config.requests / weights.reduce((sum, w) => sum + w, 0);

  for (let m = 0; m < minutes; m++) {
    const minuteStart = start + m * MINUTE;
    const version = versionAt(minuteStart);
    const expected = weights[m] * scale;
    const count = Math.floor(expected) + (chance(expected % 1) ? 1 : 0);

    for (let i = 0; i < count; i++) {
      const at = minuteStart + random() * MINUTE;
      const op = pickOperation();
      const incident = inWindow(at, incidents) as Incident | undefined;
      const hit = incident?.operation === op.id;
      const generated = op.generate(
        at,
        hit ? between(2.5, 5) : 1,
        hit && chance(0.45),
      );
      const traceId = uuidV7(at);
      const batch = batchFor(pick(instanceIds), version);
      batch.snapshots.push({
        ct: new Date(at).toISOString(),
        ti: traceId,
        d: generated.duration,
        p: 'http',
        op: op.id,
        u: `user_${1 + randomInt(2000)}`,
        a: { m: 'GET', sc: generated.status, ou: generated.url },
        t: generated.trace,
        ...(generated.error ? { e: generated.error } : {}),
      });
      stats.requests++;
      for (const log of generated.logs) {
        if (log.level === 'log' && !chance(config.logsPerRequest)) continue;
        batch.logs.push({
          timestamp: Math.round(at + generated.duration / 2),
          text: log.text,
          traceId,
          level: log.level,
          context: log.context,
        });
        stats.logs++;
      }
    }

    // Both cron jobs run once a minute, on the first instance.
    const jobs = batchFor(instanceIds[0], version);
    jobs.jobs.push(
      featuredPokemonJob(minuteStart + 5),
      reconcileJob(minuteStart + 30_005),
    );
    stats.jobs += 2;

    await flush();
    if (m % 360 === 0) report(m);
  }

  await flush(true);
  await Promise.all(inFlight);
  report(minutes);
  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
