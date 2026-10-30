import { Logger } from '@nestjs/common';
import { LOAD_CONFIG } from './load.config.js';
import { ANONYMOUS_SHARE, USER_POOL } from './user-pool.js';

type Range = readonly [number, number];

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
];
const CATEGORIES = [
  'smartphones',
  'laptops',
  'tablets',
  'groceries',
  'beauty',
  'furniture',
];

/** Anything picked by weight. */
interface Weighted {
  weight: number;
}

/** A path on this app, picked by weight. Routes with a `body` are POSTed as JSON. */
interface Route extends Weighted {
  path: () => string;
  body?: () => unknown;
}

const OK_ROUTES: Route[] = [
  { weight: 4, path: () => `/users/${1 + randomInt(30)}/summary` },
  { weight: 3, path: () => `/pokemon/${pick(POKEMON)}/matchups` },
  {
    weight: 3,
    path: () =>
      `/catalog/insights?categories=${sample(CATEGORIES, 1 + randomInt(3)).join(',')}`,
  },
  { weight: 2, path: () => `/stock/${1 + randomInt(30)}` },
  { weight: 1, path: () => '/stock/low' },
  {
    weight: 2,
    path: () => `/stock/${1 + randomInt(30)}/reservations`,
    body: () => ({ quantity: 1 + randomInt(3) }),
  },
  { weight: 1, path: () => '/' },
];

const FAILING_ROUTES: Route[] = [
  { weight: 2, path: () => `/users/${9000 + randomInt(1000)}/summary` },
  { weight: 1, path: () => '/users/abc/summary' },
  { weight: 2, path: () => '/pokemon/missingno/matchups' },
  { weight: 2, path: () => '/catalog/insights?fail=true' },
  { weight: 1, path: () => '/catalog/insights?categories=laptops,spaceships' },
  { weight: 1, path: () => `/stock/${9000 + randomInt(1000)}` },
  {
    weight: 1,
    path: () => `/stock/${1 + randomInt(30)}/reservations`,
    body: () => ({ quantity: 0 }),
  },
];

/**
 * Calls the app's own endpoints at a randomized rate: a base rate that drifts
 * along a slow wave, plus random bursts, with a share of failing requests.
 * Most requests carry an `x-user-id` from a skewed pool (see user-pool.ts).
 * A plain function, not a provider, so the generator itself is not traced.
 */
export function startLoadGenerator(baseUrl: string): void {
  const config = LOAD_CONFIG;
  if (!config.enabled) return;

  const logger = new Logger('LoadGenerator');
  const startedAt = Date.now();
  const stats = { sent: 0, skipped: 0, byStatus: new Map<string, number>() };
  let inFlight = 0;
  let burstUntil = 0;
  let burstRps = 0;
  let nextBurstAt = startedAt + seconds(randomIn(config.burst.everySeconds));

  const send = async () => {
    if (inFlight >= config.maxInFlight) {
      stats.skipped++;
      return;
    }
    const routes =
      Math.random() < config.errorRate ? FAILING_ROUTES : OK_ROUTES;
    const route = pickWeighted(routes);
    const path = route.path();
    const headers: Record<string, string> =
      Math.random() < ANONYMOUS_SHARE
        ? {}
        : { 'x-user-id': pickWeighted(USER_POOL).id };
    const body = route.body ? JSON.stringify(route.body()) : undefined;
    if (body) headers['content-type'] = 'application/json';
    inFlight++;
    stats.sent++;
    let status: string;
    try {
      const response = await fetch(baseUrl + path, {
        method: body ? 'POST' : 'GET',
        body,
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      await response.arrayBuffer();
      status = String(response.status);
    } catch {
      status = 'network error';
    } finally {
      inFlight--;
    }
    stats.byStatus.set(status, (stats.byStatus.get(status) ?? 0) + 1);
  };

  const tick = setInterval(() => {
    const now = Date.now();
    if (
      config.durationMinutes > 0 &&
      now - startedAt > config.durationMinutes * 60_000
    ) {
      clearInterval(tick);
      clearInterval(report);
      logger.log('Finished');
      return;
    }

    if (now >= nextBurstAt) {
      burstRps = randomIn(config.burst.rps);
      burstUntil = now + seconds(randomIn(config.burst.lastsSeconds));
      nextBurstAt = burstUntil + seconds(randomIn(config.burst.everySeconds));
      logger.log(
        `Burst: ~${Math.round(burstRps)} req/s for ${Math.round((burstUntil - now) / 1000)}s`,
      );
    }

    const phase =
      ((now - startedAt) / (config.wave.periodMinutes * 60_000)) * 2 * Math.PI;
    const waveRps =
      config.baseRps * (1 + config.wave.amplitude * Math.sin(phase));
    const rps = now < burstUntil ? burstRps : waveRps;

    // Jitter the count and spread the requests over the second.
    const count = Math.max(0, Math.round(rps * (0.5 + Math.random())));
    for (let i = 0; i < count; i++) {
      setTimeout(() => void send(), Math.random() * 1000);
    }
  }, 1000);

  const report = setInterval(() => {
    const statuses = [...stats.byStatus]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, n]) => `${status}: ${n}`)
      .join(', ');
    logger.log(
      `Sent ${stats.sent} (${stats.skipped} skipped, ${inFlight} in flight). ${statuses}`,
    );
  }, seconds(config.reportEverySeconds));

  tick.unref();
  report.unref();
  logger.log(`Generating traffic against ${baseUrl}`);
}

function seconds(value: number): number {
  return value * 1000;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randomIn([min, max]: Range): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

function sample<T>(items: readonly T[], count: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function pickWeighted<T extends Weighted>(items: readonly T[]): T {
  let roll = Math.random() * items.reduce((sum, i) => sum + i.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}
