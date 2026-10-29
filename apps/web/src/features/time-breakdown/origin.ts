/**
 * Display categories for the breakdown. The agent only reports `auto` or
 * `manual` as a span's origin, so the category comes from the class name
 * (NestJS naming conventions); an origin that already is a category wins.
 */
export type SpanCategory =
  | 'controller'
  | 'provider'
  | 'database'
  | 'http'
  | 'guard'
  | 'interceptor'
  | 'pipe'
  | 'processor'
  | 'code';

const CATEGORIES: ReadonlySet<string> = new Set<SpanCategory>([
  'controller',
  'provider',
  'database',
  'http',
  'guard',
  'interceptor',
  'pipe',
  'processor',
  'code',
]);

const BY_CLASS_NAME: ReadonlyArray<[RegExp, SpanCategory]> = [
  [/^https?$/i, 'http'],
  [
    /(Repository|Prisma|TypeOrm|Sequelize|Knex|Kysely|Mongo|Redis|Database|Db)/,
    'database',
  ],
  [/Controller$/, 'controller'],
  [/Guard$/, 'guard'],
  [/Interceptor$/, 'interceptor'],
  [/Pipe$/, 'pipe'],
  [/(Processor|Consumer|Worker)$/, 'processor'],
  [/(Service|Provider|Gateway|Client)$/, 'provider'],
];

export function spanCategory(item: {
  origin?: string;
  className: string;
}): SpanCategory {
  const origin = item.origin?.toLowerCase();
  if (origin && CATEGORIES.has(origin)) return origin as SpanCategory;
  for (const [pattern, category] of BY_CLASS_NAME) {
    if (pattern.test(item.className)) return category;
  }
  return 'code';
}

const CATEGORY_COLORS: Record<SpanCategory, string> = {
  database: 'var(--span-db)',
  http: 'var(--span-http)',
  provider: 'var(--span-code)',
  controller: 'var(--chart-4)',
  processor: 'var(--chart-4)',
  guard: 'var(--chart-3)',
  interceptor: 'var(--chart-3)',
  pipe: 'var(--chart-3)',
  code: 'var(--chart-3)',
};

const CATEGORY_LABELS: Record<SpanCategory, string> = {
  database: 'Database',
  http: 'Outgoing HTTP',
  provider: 'Provider',
  controller: 'Controller',
  processor: 'Processor',
  guard: 'Guard',
  interceptor: 'Interceptor',
  pipe: 'Pipe',
  code: 'Other code',
};

/** The remainder slice of the summary (rows the API did not list). */
export const OTHER = 'other';

export function categoryColor(category: SpanCategory | typeof OTHER): string {
  return category === OTHER ? 'var(--bar)' : CATEGORY_COLORS[category];
}

export function categoryLabel(category: SpanCategory | typeof OTHER): string {
  return category === OTHER ? 'Unlisted' : CATEGORY_LABELS[category];
}

export interface OriginShare {
  category: SpanCategory | typeof OTHER;
  selfMs: number;
  /** selfMs / totalSelfMs, 0..1. */
  share: number;
}

/**
 * Self time per category, largest first. If the items don't add up to the total
 * (the API returned only the top rows), the rest is an "other" slice.
 */
export function originShares(
  items: ReadonlyArray<{ origin: string; className: string; selfMs: number }>,
  totalSelfMs: number,
): OriginShare[] {
  const byOrigin = new Map<SpanCategory | typeof OTHER, number>();
  for (const item of items) {
    const category = spanCategory(item);
    byOrigin.set(category, (byOrigin.get(category) ?? 0) + item.selfMs);
  }
  const listed = [...byOrigin.values()].reduce((sum, ms) => sum + ms, 0);
  const rest = totalSelfMs - listed;
  if (rest > totalSelfMs * 0.001) byOrigin.set(OTHER, rest);
  return [...byOrigin]
    .map(([category, selfMs]) => ({
      category,
      selfMs,
      share: totalSelfMs > 0 ? selfMs / totalSelfMs : 0,
    }))
    .toSorted((a, b) => b.selfMs - a.selfMs);
}
