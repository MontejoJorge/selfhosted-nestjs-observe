import { RequestMethod, type INestApplication } from '@nestjs/common';

/** Query routes are served under this prefix; the agent's ingest routes are not. */
export const API_PREFIX = 'api';

/**
 * Route prefixing shared by `main.ts` and OpenAPI generation, so the spec paths
 * match the running app. Needs no providers, so it works in preview mode.
 */
export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'applications/telemetry', method: RequestMethod.POST },
      { path: 'applications/profiles', method: RequestMethod.POST },
    ],
  });
}
