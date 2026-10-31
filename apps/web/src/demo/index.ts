/**
 * Backend-less demo: a Mock Service Worker answers every `/api/*` call with
 * generated telemetry. Only loaded when built with `--mode demo`.
 */

import { setupWorker } from 'msw/browser';
import { managementHandlers } from './handlers/management';
import { releaseHandlers } from './handlers/releases';
import { telemetryHandlers } from './handlers/telemetry';
import { catchUp } from './store';

export { DemoBanner } from './demo-banner';

export async function startDemo(): Promise<void> {
  catchUp();
  const worker = setupWorker(
    ...telemetryHandlers,
    ...releaseHandlers,
    ...managementHandlers,
  );
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });
}
