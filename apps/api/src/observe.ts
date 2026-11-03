import { ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import type { Request } from 'express';
import { API_PREFIX } from './app.setup.js';
import type { Env } from './config/env.js';
import {
  SELF_OBSERVE_BOOT,
  type SelfObserveBoot,
} from './self-observe/application/ports.js';
import { SelfObserveSwitchModule } from './self-observe/self-observe.module.js';

/**
 * The collector observes itself: its own requests, cron jobs, errors and logs are sent to
 * its own ingest. Decided at boot (ADR 0009): with OBSERVE_APP_KEY / OBSERVE_APP_SECRET it
 * reports to OBSERVE_ENDPOINT like any application; otherwise the dashboard's self-observe
 * switch turns it on with credentials generated in memory. Else the agent is disabled.
 */
export const { ObserveModule, ObserveInstrument } = createObserveModule();

const INGEST_ROUTES = new Set([
  '/applications/telemetry',
  '/applications/profiles',
]);

/** Polled by Docker and load balancers: tracing it would only add noise. */
const HEALTH_ROUTE = `/${API_PREFIX}/health`;

export const SelfObserveModule = ObserveModule.forRootAsync({
  imports: [SelfObserveSwitchModule],
  inject: [ConfigService, SELF_OBSERVE_BOOT],
  useFactory: (config: ConfigService<Env, true>, boot: SelfObserveBoot) => {
    const fromEnv = boot.source === 'env';
    const appKey = fromEnv
      ? (config.get('OBSERVE_APP_KEY', { infer: true }) ?? '')
      : boot.credentials.appKey;
    const appSecret = fromEnv
      ? (config.get('OBSERVE_APP_SECRET', { infer: true }) ?? '')
      : boot.credentials.appSecret;
    return {
      enabled: boot.source !== 'off',
      appKey,
      appSecret,
      // Self mode reports to this very process unless told otherwise (empty = unset).
      endpoint:
        config.get('OBSERVE_ENDPOINT', { infer: true }) ||
        (fromEnv
          ? undefined
          : `http://127.0.0.1:${config.get('API_PORT', { infer: true })}`),
      serviceId: 'observe-api',
      forwardLogs: true,
      http: {
        // Ingest from other applications is traced; only the collector's own batches
        // (sent with its own key) are not, or every flush would produce the next one.
        // Health checks are not traced either.
        ignore: (req: Request) =>
          req.path === HEALTH_ROUTE ||
          (req.method === 'POST' &&
            INGEST_ROUTES.has(req.path) &&
            req.headers['x-api-key'] === appKey),
      },
    };
  },
});
