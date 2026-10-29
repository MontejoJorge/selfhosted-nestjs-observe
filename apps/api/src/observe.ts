import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import type { Env } from './config/env.js';

/**
 * The collector observes itself: with OBSERVE_APP_KEY / OBSERVE_APP_SECRET set, its own
 * requests, cron jobs, errors and logs are sent to OBSERVE_ENDPOINT (usually itself).
 * Without credentials the agent is disabled.
 */
export const { ObserveModule, ObserveInstrument } = createObserveModule();

/** The agent's own batches are not traced, or every flush would produce the next one. */
const INGEST_ROUTES = ['/applications/telemetry', '/applications/profiles'];

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
        ignore: INGEST_ROUTES.map((path) => ({
          method: RequestMethod[RequestMethod.POST],
          path,
        })),
      },
    };
  },
});
