/**
 * Update check, kept in memory. The demo never calls GitHub: it reports the dashboard's
 * own version as the latest release, so it is always up to date.
 */

import type {
  UpdateSettingsDto,
  UpdateStatusDto,
} from '@/lib/api/generated/api';
import { http, HttpResponse } from 'msw';
import { version } from '../../../package.json';
import { TIME } from '../world';

const RELEASES_URL =
  'https://github.com/MontejoJorge/selfhosted-nestjs-observe/releases';

const status: UpdateStatusDto = {
  currentVersion: version,
  enabled: true,
  disabledByEnv: false,
  latestVersion: `v${version}`,
  latestUrl: `${RELEASES_URL}/tag/v${version}`,
  latestPublishedAt: null,
  updateAvailable: false,
  releasesUrl: RELEASES_URL,
  checkedAt: new Date(Date.now() - 3 * TIME.HOUR).toISOString(),
  error: null,
};

const off = () =>
  HttpResponse.json(
    {
      statusCode: 409,
      message: 'The update check is turned off',
      error: 'Conflict',
    },
    { status: 409 },
  );

export const updateHandlers = [
  http.get('*/api/updates', () => HttpResponse.json(status)),

  http.patch('*/api/updates/settings', async ({ request }) => {
    const { enabled } = (await request.json()) as UpdateSettingsDto;
    status.enabled = enabled;
    return HttpResponse.json(status);
  }),

  http.post('*/api/updates/check', () => {
    if (!status.enabled) return off();
    status.checkedAt = new Date().toISOString();
    return HttpResponse.json(status);
  }),
];
