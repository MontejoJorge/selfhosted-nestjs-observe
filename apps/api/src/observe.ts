import { ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import type { Request } from 'express';
import type { Env } from './config/env.js';

/**
 * The collector observes itself: with OBSERVE_APP_KEY / OBSERVE_APP_SECRET set, its own
 * requests, cron jobs, errors and logs are sent to OBSERVE_ENDPOINT (usually itself).
 * Without credentials the agent is disabled.
 */
export const { ObserveModule, ObserveInstrument } = createObserveModule();

const INGEST_ROUTES = new Set([
  '/applications/telemetry',
  '/applications/profiles',
]);

export const SelfObserveModule = ObserveModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const appKey = config.get('OBSERVE_APP_KEY', { infer: true });
    const appSecret = config.get('OBSERVE_APP_SECRET', { infer: true });
    return {
      enabled: Boolean(appKey && appSecret),
      appKey: appKey ?? '',
      appSecret: appSecret ?? '',
      endpoint: config.get('OBSERVE_ENDPOINT', { infer: true }),
      serviceId: 'observe-api',
      forwardLogs: true,
      http: {
        // Ingest from other applications is traced; only the collector's own batches
        // (sent with its own key) are not, or every flush would produce the next one.
        ignore: (req: Request) =>
          req.method === 'POST' &&
          INGEST_ROUTES.has(req.path) &&
          req.headers['x-api-key'] === appKey,
      },
    };
  },
});
