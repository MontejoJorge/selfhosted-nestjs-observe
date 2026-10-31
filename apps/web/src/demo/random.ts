/** Seeded randomness so the demo data is stable within a session. */

export type Rng = () => number;

/** mulberry32: small, fast, good enough for fake telemetry. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, to seed per-entity generators. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic noise in [-1, 1] for a key and a number (e.g. a timestamp). */
export function noise(key: string, n: number): number {
  return createRng(hashString(key) ^ Math.floor(n))() * 2 - 1;
}

export function normal(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal sample around a median, `spread` is the sigma of the log. */
export function logNormal(rng: Rng, median: number, spread: number): number {
  return median * Math.exp(spread * normal(rng));
}

export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30)
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** Picks by weight (`weights[i]` for `items[i]`). */
export function pickWeighted<T>(
  rng: Rng,
  items: readonly T[],
  weights: readonly number[],
): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function hex(rng: Rng, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += Math.floor(rng() * 16).toString(16);
  return out;
}

export function uuid(rng: Rng): string {
  const h = hex(rng, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}

/** UUIDv7-looking id whose prefix is the timestamp, like the collector's ids. */
export function uuidV7(rng: Rng, ms: number): string {
  const time = Math.floor(ms).toString(16).padStart(12, '0');
  const h = hex(rng, 20);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${h.slice(0, 3)}-b${h.slice(3, 6)}-${h.slice(6, 18)}`;
}
