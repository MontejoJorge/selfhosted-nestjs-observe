/**
 * The fictional setup the demo reports on: projects, applications, their
 * versions, HTTP operations, jobs and the errors they raise. Telemetry is
 * generated from these definitions in `store.ts`.
 */

import type { ErrorSource, LogLevel } from '@/lib/api/generated/api';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Days of raw telemetry the demo generates (the 7d range is always full). */
export const HISTORY_DAYS = 8;
export const RETENTION_DAYS = 14;

export interface SpanTemplate {
  className: string;
  methodName: string;
  name?: string;
  /** Fraction of the parent span's duration this span takes. */
  share: number;
  tags?: Record<string, string | number | boolean>;
  origin?: 'auto' | 'manual';
  /** Gets the error when the execution fails. */
  fails?: boolean;
  children?: SpanTemplate[];
}

export interface ProjectDef {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAgoMs: number;
}

export interface ApplicationDef {
  id: string;
  projectId: string;
  name: string;
  tags: string[];
  instances: string[];
  /** Versions in deploy order, `agoMs` before page load. */
  versions: Array<{ version: string; agoMs: number }>;
  createdAgoMs: number;
  /** Runtime profile: base CPU (% of a core) and RSS (MB). */
  runtime: { cpu: number; rss: number };
}

export interface VersionEffect {
  latency?: number;
  errorRate?: number;
}

export interface OperationDef {
  appId: string;
  operationId: string;
  method: string;
  /** Peak requests per minute. */
  rate: number;
  /** Not shaped by the daily traffic curve (health checks). */
  steady?: boolean;
  medianMs: number;
  spread: number;
  /** Builds the concrete URL from a random number. */
  url: (n: number) => string;
  errorRate: number;
  errorKey?: string;
  errorStatus?: number;
  clientError?: { rate: number; status: number };
  /** Carries a user id (most requests do). */
  users?: boolean;
  byVersion?: Record<string, VersionEffect>;
  spans: SpanTemplate[];
  logs?: Array<{
    level: LogLevel;
    context: string;
    text: (n: number) => string;
    chance: number;
  }>;
  /** Enqueues this job (queue/name) on success. */
  enqueues?: string;
}

export interface JobDef {
  appId: string;
  queue: string;
  name: string;
  /** Runs every minute at this second, or `rate` runs per minute when null. */
  everyMinuteAt: number | null;
  rate: number;
  medianMs: number;
  spread: number;
  failRate: number;
  errorKey?: string;
  maxAttempts: number | null;
  byVersion?: Record<string, VersionEffect>;
  spans: SpanTemplate[];
  log: { context: string; text: (n: number) => string };
}

export interface ErrorDef {
  key: string;
  appId: string;
  source: ErrorSource;
  errorClass: string;
  message: string;
  stack: string;
  culprit: string;
  fingerprint: string;
}

export const PROJECTS: ProjectDef[] = [
  {
    id: '0b6f4c1e-5a9d-4e2b-9c71-2f8d3a6e1b40',
    slug: 'acme-store',
    name: 'Acme Store',
    description: 'Inventory API and the workers behind the online store.',
    createdAgoMs: 41 * DAY,
  },
  {
    id: '7c2e9a51-3d84-4f6b-8a10-9e5b4c7d2f63',
    slug: 'billing',
    name: 'Billing',
    description: 'Invoices and PDF rendering.',
    createdAgoMs: 23 * DAY,
  },
];

export const APP_IDS = {
  inventory: '3f1a7c92-8b4e-4d61-a5f0-6c2d9e8b1a74',
  notifications: '9d4b2e67-1c5a-4f83-b7e9-0a6f3d2c8e15',
  billing: 'c5e8a1d3-7f2b-4c96-8e40-b1d7f6a9c352',
} as const;

export const APPLICATIONS: ApplicationDef[] = [
  {
    id: APP_IDS.inventory,
    projectId: PROJECTS[0]!.id,
    name: 'inventory-api',
    tags: ['http', 'sqlite'],
    instances: ['inventory-api-7d4f9-kx2lp', 'inventory-api-7d4f9-q8vzn'],
    versions: [
      { version: '1.4.2', agoMs: 12 * DAY },
      { version: '1.5.0', agoMs: 3 * DAY + 4 * HOUR },
      { version: '1.5.1', agoMs: 5 * HOUR + 20 * MINUTE },
    ],
    createdAgoMs: 40 * DAY,
    runtime: { cpu: 9, rss: 168 },
  },
  {
    id: APP_IDS.notifications,
    projectId: PROJECTS[0]!.id,
    name: 'notifications-worker',
    tags: ['bullmq'],
    instances: ['notifications-worker-0'],
    versions: [
      { version: '2.0.3', agoMs: 15 * DAY },
      { version: '2.1.0', agoMs: 40 * HOUR },
    ],
    createdAgoMs: 38 * DAY,
    runtime: { cpu: 4, rss: 122 },
  },
  {
    id: APP_IDS.billing,
    projectId: PROJECTS[1]!.id,
    name: 'billing-api',
    tags: ['http', 'stripe'],
    instances: ['billing-api-5c8d2-mm4tw'],
    versions: [
      { version: '0.9.0', agoMs: 10 * DAY },
      { version: '0.9.1', agoMs: 2 * DAY + 7 * HOUR },
    ],
    createdAgoMs: 22 * DAY,
    runtime: { cpu: 6, rss: 141 },
  },
];

export const USERS = Array.from(
  { length: 14 },
  (_, i) => `user_${1001 + i * 7}`,
);

const sqlite = (
  verb: string,
  table: string,
  statement: string,
  share: number,
): SpanTemplate => ({
  className: 'Kysely',
  methodName: 'execute',
  name: `${verb} ${table}`,
  share,
  origin: 'manual',
  tags: { 'db.system': 'sqlite', 'db.statement': statement },
});

const httpGet = (url: string, share: number, fails = false): SpanTemplate => ({
  className: 'HttpService',
  methodName: 'get',
  name: `GET ${new URL(url).host}`,
  share,
  fails,
  tags: { 'http.method': 'GET', 'http.url': url },
});

const code = (
  className: string,
  methodName: string,
  share: number,
  children: SpanTemplate[] = [],
  fails = false,
): SpanTemplate => ({ className, methodName, share, children, fails });

const health = (appId: string, rate: number): OperationDef => ({
  appId,
  operationId: 'GET /health',
  method: 'GET',
  rate,
  steady: true,
  medianMs: 1.2,
  spread: 0.3,
  url: () => '/health',
  errorRate: 0,
  spans: [code('HealthController', 'check', 0.9)],
});

const productId = (n: number) => 1000 + Math.floor(n * 240);
const POKEMON = [
  'pikachu',
  'charizard',
  'gengar',
  'snorlax',
  'lucario',
  'eevee',
  'gyarados',
  'dragonite',
];

export const OPERATIONS: OperationDef[] = [
  {
    appId: APP_IDS.inventory,
    operationId: 'GET /stock/:productId',
    method: 'GET',
    rate: 1.4,
    medianMs: 9,
    spread: 0.45,
    url: (n) => `/stock/${productId(n)}`,
    errorRate: 0,
    errorKey: 'db-locked',
    clientError: { rate: 0.03, status: 404 },
    users: true,
    byVersion: { '1.5.0': { latency: 1.4, errorRate: 0.03 } },
    spans: [
      code('StockController', 'getStock', 0.97, [
        code('StockService', 'findOne', 0.85, [
          sqlite(
            'SELECT',
            'stock',
            'select * from "stock" where "product_id" = ?',
            0.7,
          ),
        ]),
      ]),
    ],
  },
  {
    appId: APP_IDS.inventory,
    operationId: 'POST /stock/:productId/reservations',
    method: 'POST',
    rate: 0.6,
    medianMs: 24,
    spread: 0.5,
    url: (n) => `/stock/${productId(n)}/reservations`,
    // The lock contention ships with 1.5.0 and is mostly fixed by 1.5.1.
    errorRate: 0,
    errorKey: 'db-locked',
    clientError: { rate: 0.06, status: 409 },
    users: true,
    byVersion: {
      '1.5.0': { latency: 1.8, errorRate: 0.12 },
      '1.5.1': { errorRate: 0.003 },
    },
    enqueues: 'emails/send-receipt',
    spans: [
      code('StockController', 'reserve', 0.97, [
        code('StockService', 'reserve', 0.9, [
          sqlite(
            'SELECT',
            'stock',
            'select "available" from "stock" where "product_id" = ?',
            0.2,
          ),
          {
            ...sqlite(
              'UPDATE',
              'stock',
              'update "stock" set "available" = "available" - ? where "product_id" = ?',
              0.35,
            ),
            fails: true,
          },
          sqlite(
            'INSERT',
            'reservations',
            'insert into "reservations" ("product_id", "user_id", "quantity") values (?, ?, ?)',
            0.25,
          ),
        ]),
      ]),
    ],
    logs: [
      {
        level: 'log',
        context: 'StockService',
        text: (n) =>
          `Reserved ${1 + Math.floor(n * 4)} units of product ${productId(n)}`,
        chance: 0.9,
      },
    ],
  },
  {
    appId: APP_IDS.inventory,
    operationId: 'GET /stock/low',
    method: 'GET',
    rate: 0.3,
    medianMs: 35,
    spread: 0.4,
    url: (n) => `/stock/low?threshold=${5 + Math.floor(n * 3) * 5}`,
    errorRate: 0,
    users: true,
    spans: [
      code('StockController', 'low', 0.97, [
        code('StockService', 'lowStock', 0.9, [
          sqlite(
            'SELECT',
            'stock',
            'select * from "stock" where "available" < ? order by "available"',
            0.8,
          ),
        ]),
      ]),
    ],
    logs: [
      {
        level: 'warn',
        context: 'StockService',
        text: (n) =>
          `${2 + Math.floor(n * 9)} products are below the stock threshold`,
        chance: 0.4,
      },
    ],
  },
  {
    appId: APP_IDS.inventory,
    operationId: 'GET /catalog/insights',
    method: 'GET',
    rate: 0.25,
    medianMs: 420,
    spread: 0.55,
    url: (n) =>
      `/catalog/insights?category=${['smartphones', 'laptops', 'fragrances', 'groceries'][Math.floor(n * 4)]}`,
    errorRate: 0.01,
    errorKey: 'insights-undefined',
    users: true,
    spans: [
      code('CatalogController', 'insights', 0.98, [
        code('CatalogService', 'buildInsights', 0.95, [
          httpGet('https://dummyjson.com/products?limit=100', 0.7),
          code('CatalogService', 'score', 0.2, [], true),
        ]),
      ]),
    ],
  },
  {
    appId: APP_IDS.inventory,
    operationId: 'GET /pokemon/:name/matchups',
    method: 'GET',
    rate: 0.4,
    medianMs: 180,
    spread: 0.6,
    url: (n) => `/pokemon/${POKEMON[Math.floor(n * POKEMON.length)]}/matchups`,
    errorRate: 0.03,
    errorKey: 'pokeapi-502',
    errorStatus: 502,
    users: true,
    spans: [
      code('PokemonController', 'matchups', 0.98, [
        code('PokemonService', 'matchups', 0.95, [
          httpGet('https://pokeapi.co/api/v2/pokemon/pikachu', 0.55, true),
          httpGet('https://pokeapi.co/api/v2/type/electric', 0.35),
        ]),
      ]),
    ],
  },
  {
    appId: APP_IDS.inventory,
    operationId: 'GET /users/:id/summary',
    method: 'GET',
    rate: 0.35,
    medianMs: 18,
    spread: 0.45,
    url: (n) => `/users/${USERS[Math.floor(n * USERS.length)]}/summary`,
    errorRate: 0,
    clientError: { rate: 0.02, status: 404 },
    users: true,
    spans: [
      code('UsersController', 'summary', 0.97, [
        code('UsersService', 'summary', 0.9, [
          sqlite(
            'SELECT',
            'reservations',
            'select count(*) as "count", sum("quantity") as "units" from "reservations" where "user_id" = ?',
            0.75,
          ),
        ]),
      ]),
    ],
  },
  health(APP_IDS.inventory, 0.2),
  health(APP_IDS.notifications, 0.2),
  {
    appId: APP_IDS.billing,
    operationId: 'POST /invoices',
    method: 'POST',
    rate: 0.2,
    medianMs: 85,
    spread: 0.5,
    url: () => '/invoices',
    errorRate: 0.012,
    errorKey: 'stripe-timeout',
    clientError: { rate: 0.04, status: 422 },
    users: true,
    enqueues: 'invoices/generate-pdf',
    spans: [
      code('InvoicesController', 'create', 0.98, [
        code('InvoicesService', 'create', 0.95, [
          {
            className: 'StripeClient',
            methodName: 'createInvoice',
            name: 'POST api.stripe.com',
            share: 0.7,
            fails: true,
            tags: {
              'http.method': 'POST',
              'http.url': 'https://api.stripe.com/v1/invoices',
            },
          },
        ]),
      ]),
    ],
    logs: [
      {
        level: 'log',
        context: 'InvoicesService',
        text: (n) => `Invoice INV-${20400 + Math.floor(n * 900)} created`,
        chance: 0.95,
      },
    ],
  },
  {
    appId: APP_IDS.billing,
    operationId: 'GET /invoices/:id',
    method: 'GET',
    rate: 0.5,
    medianMs: 12,
    spread: 0.4,
    url: (n) => `/invoices/INV-${20400 + Math.floor(n * 900)}`,
    errorRate: 0,
    clientError: { rate: 0.04, status: 404 },
    users: true,
    byVersion: { '0.9.1': { latency: 0.7 } },
    spans: [
      code('InvoicesController', 'findOne', 0.97, [
        code('InvoicesService', 'findOne', 0.8),
      ]),
    ],
  },
  health(APP_IDS.billing, 0.2),
];

export const JOBS: JobDef[] = [
  {
    appId: APP_IDS.inventory,
    queue: 'cron',
    name: 'featured-pokemon',
    everyMinuteAt: 0,
    rate: 0,
    medianMs: 220,
    spread: 0.5,
    failRate: 0.01,
    errorKey: 'featured-502',
    maxAttempts: null,
    spans: [
      code('JobsService', 'featuredPokemon', 0.98, [
        httpGet('https://pokeapi.co/api/v2/pokemon?limit=20', 0.8, true),
      ]),
    ],
    log: {
      context: 'JobsService',
      text: (n) =>
        `Featured pokemon of the minute: ${POKEMON[Math.floor(n * POKEMON.length)]}`,
    },
  },
  {
    appId: APP_IDS.inventory,
    queue: 'cron',
    name: 'inventory-reconcile',
    everyMinuteAt: 30,
    rate: 0,
    medianMs: 60,
    spread: 0.35,
    failRate: 0,
    maxAttempts: null,
    byVersion: { '1.5.0': { latency: 5 } },
    spans: [
      code('JobsService', 'reconcile', 0.98, [
        sqlite(
          'SELECT',
          'reservations',
          'select "product_id", sum("quantity") from "reservations" group by "product_id"',
          0.45,
        ),
        sqlite(
          'UPDATE',
          'stock',
          'update "stock" set "reserved" = ? where "product_id" = ?',
          0.4,
        ),
      ]),
    ],
    log: {
      context: 'JobsService',
      text: (n) => `Reconciled ${180 + Math.floor(n * 60)} products`,
    },
  },
  {
    appId: APP_IDS.notifications,
    queue: 'emails',
    name: 'send-receipt',
    everyMinuteAt: null,
    rate: 0,
    medianMs: 310,
    spread: 0.5,
    failRate: 0.02,
    errorKey: 'smtp-timeout',
    maxAttempts: 3,
    spans: [
      code('ReceiptProcessor', 'process', 0.98, [
        code('TemplateService', 'render', 0.12),
        {
          ...code('MailerService', 'send', 0.8, [], true),
          tags: { 'smtp.host': 'smtp.postmarkapp.com' },
        },
      ]),
    ],
    log: {
      context: 'ReceiptProcessor',
      text: (n) => `Receipt sent to customer #${4000 + Math.floor(n * 900)}`,
    },
  },
  {
    appId: APP_IDS.notifications,
    queue: 'emails',
    name: 'send-low-stock-alert',
    everyMinuteAt: null,
    rate: 0.05,
    medianMs: 280,
    spread: 0.4,
    failRate: 0.01,
    errorKey: 'smtp-timeout',
    maxAttempts: 3,
    spans: [
      code('LowStockProcessor', 'process', 0.98, [
        {
          ...code('MailerService', 'send', 0.85, [], true),
          tags: { 'smtp.host': 'smtp.postmarkapp.com' },
        },
      ]),
    ],
    log: {
      context: 'LowStockProcessor',
      text: (n) => `Low stock alert sent for ${1 + Math.floor(n * 6)} products`,
    },
  },
  {
    appId: APP_IDS.notifications,
    queue: 'webhooks',
    name: 'deliver',
    everyMinuteAt: null,
    rate: 0.3,
    medianMs: 250,
    spread: 0.7,
    failRate: 0.04,
    errorKey: 'webhook-410',
    maxAttempts: 5,
    byVersion: { '2.1.0': { latency: 0.75 } },
    spans: [
      code('WebhookProcessor', 'process', 0.98, [
        {
          className: 'HttpService',
          methodName: 'post',
          name: 'POST hooks.partner.example',
          share: 0.85,
          fails: true,
          tags: {
            'http.method': 'POST',
            'http.url': 'https://hooks.partner.example/orders',
          },
        },
      ]),
    ],
    log: {
      context: 'WebhookProcessor',
      text: (n) =>
        `Webhook order.updated delivered (attempt ${1 + Math.floor(n * 2)})`,
    },
  },
  {
    appId: APP_IDS.billing,
    queue: 'invoices',
    name: 'generate-pdf',
    everyMinuteAt: null,
    rate: 0,
    medianMs: 1200,
    spread: 0.4,
    failRate: 0.03,
    errorKey: 'pdf-oom',
    maxAttempts: 2,
    spans: [
      code('PdfProcessor', 'process', 0.99, [
        code('PdfRenderer', 'render', 0.8, [], true),
        {
          className: 'S3Client',
          methodName: 'putObject',
          name: 'PUT s3',
          share: 0.15,
          tags: {
            'http.method': 'PUT',
            'http.url': 'https://invoices.s3.eu-west-1.amazonaws.com',
          },
        },
      ]),
    ],
    log: {
      context: 'PdfProcessor',
      text: (n) => `Rendered INV-${20400 + Math.floor(n * 900)}.pdf`,
    },
  },
];

const stack = (cls: string, message: string, frames: string[]) =>
  [`${cls}: ${message}`, ...frames.map((f) => `    at ${f}`)].join('\n');

export const ERRORS: ErrorDef[] = [
  {
    key: 'db-locked',
    appId: APP_IDS.inventory,
    source: 'request',
    errorClass: 'SqliteError',
    message: 'database is locked',
    culprit: 'POST /stock/:productId/reservations',
    fingerprint: 'a41f9c0e7b2d',
    stack: stack('SqliteError', 'database is locked', [
      'Statement.run (node_modules/better-sqlite3/lib/methods/wrappers.js:5:21)',
      'SqliteConnection.executeQuery (node_modules/kysely/dist/esm/dialect/sqlite/sqlite-driver.js:86:42)',
      'StockRepository.decrement (src/stock/stock.repository.ts:58:7)',
      'StockService.reserve (src/stock/stock.service.ts:41:5)',
      'StockController.reserve (src/stock/stock.controller.ts:29:12)',
    ]),
  },
  {
    key: 'insights-undefined',
    appId: APP_IDS.inventory,
    source: 'request',
    errorClass: 'TypeError',
    message: "Cannot read properties of undefined (reading 'price')",
    culprit: 'GET /catalog/insights',
    fingerprint: '5c03be81d9fa',
    stack: stack(
      'TypeError',
      "Cannot read properties of undefined (reading 'price')",
      [
        'CatalogService.score (src/catalog/catalog.service.ts:77:31)',
        'Array.map (<anonymous>)',
        'CatalogService.buildInsights (src/catalog/catalog.service.ts:52:22)',
        'CatalogController.insights (src/catalog/catalog.controller.ts:18:12)',
      ],
    ),
  },
  {
    key: 'pokeapi-502',
    appId: APP_IDS.inventory,
    source: 'request',
    errorClass: 'BadGatewayException',
    message: 'PokeAPI responded with 502',
    culprit: 'GET /pokemon/:name/matchups',
    fingerprint: 'e2d7a6309c14',
    stack: stack('BadGatewayException', 'PokeAPI responded with 502', [
      'getJson (src/common/http/get-json.ts:21:11)',
      'PokemonService.matchups (src/pokemon/pokemon.service.ts:34:20)',
      'PokemonController.matchups (src/pokemon/pokemon.controller.ts:15:12)',
    ]),
  },
  {
    key: 'featured-502',
    appId: APP_IDS.inventory,
    source: 'job',
    errorClass: 'BadGatewayException',
    message: 'PokeAPI responded with 502',
    culprit: 'cron/featured-pokemon',
    fingerprint: '8f61c2e4b07a',
    stack: stack('BadGatewayException', 'PokeAPI responded with 502', [
      'getJson (src/common/http/get-json.ts:21:11)',
      'JobsService.featuredPokemon (src/jobs/jobs.service.ts:24:18)',
    ]),
  },
  {
    key: 'smtp-timeout',
    appId: APP_IDS.notifications,
    source: 'job',
    errorClass: 'Error',
    message: 'Connection timeout after 10000ms (smtp.postmarkapp.com:587)',
    culprit: 'emails/send-receipt',
    fingerprint: '1b9e47d3c8f2',
    stack: stack(
      'Error',
      'Connection timeout after 10000ms (smtp.postmarkapp.com:587)',
      [
        'SMTPConnection._onTimeout (node_modules/nodemailer/lib/smtp-connection/index.js:796:20)',
        'MailerService.send (src/mailer/mailer.service.ts:33:11)',
        'ReceiptProcessor.process (src/emails/receipt.processor.ts:22:5)',
      ],
    ),
  },
  {
    key: 'webhook-410',
    appId: APP_IDS.notifications,
    source: 'job',
    errorClass: 'WebhookDeliveryError',
    message: 'hooks.partner.example responded 410 Gone',
    culprit: 'webhooks/deliver',
    fingerprint: 'c7a20f5e931b',
    stack: stack(
      'WebhookDeliveryError',
      'hooks.partner.example responded 410 Gone',
      [
        'WebhookProcessor.deliver (src/webhooks/webhook.processor.ts:48:13)',
        'WebhookProcessor.process (src/webhooks/webhook.processor.ts:27:7)',
      ],
    ),
  },
  {
    key: 'stripe-timeout',
    appId: APP_IDS.billing,
    source: 'request',
    errorClass: 'StripeConnectionError',
    message:
      'An error occurred with our connection to Stripe. Request was retried 2 times.',
    culprit: 'POST /invoices',
    fingerprint: '4e8b1d6a2f90',
    stack: stack(
      'StripeConnectionError',
      'An error occurred with our connection to Stripe. Request was retried 2 times.',
      [
        'RequestSender._request (node_modules/stripe/esm/RequestSender.js:301:31)',
        'StripeClient.createInvoice (src/stripe/stripe.client.ts:40:12)',
        'InvoicesService.create (src/invoices/invoices.service.ts:36:28)',
      ],
    ),
  },
  {
    key: 'pdf-oom',
    appId: APP_IDS.billing,
    source: 'job',
    errorClass: 'RangeError',
    message: 'Array buffer allocation failed',
    culprit: 'invoices/generate-pdf',
    fingerprint: '9a3c5e7f1d28',
    stack: stack('RangeError', 'Array buffer allocation failed', [
      'new ArrayBuffer (<anonymous>)',
      'PdfRenderer.render (src/pdf/pdf.renderer.ts:64:19)',
      'PdfProcessor.process (src/pdf/pdf.processor.ts:19:30)',
    ]),
  },
];

export const TIME = { MINUTE, HOUR, DAY };
