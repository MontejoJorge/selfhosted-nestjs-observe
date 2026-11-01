/**
 * Self-observe switch, kept in memory. There is no collector to restart in the demo, so a
 * change only shows the restart notice; no self project is created.
 */

import type {
  SelfObserveStatusDto,
  UpdateSelfObserveDto,
} from '@/lib/api/generated/api';
import { http, HttpResponse } from 'msw';

const status: SelfObserveStatusDto = {
  enabled: false,
  source: 'off',
  restartRequired: false,
  projectSlug: null,
  projectName: null,
  applicationName: null,
};

export const selfObserveHandlers = [
  http.get('*/api/self-observe', () => HttpResponse.json(status)),

  http.patch('*/api/self-observe', async ({ request }) => {
    const { enabled } = (await request.json()) as UpdateSelfObserveDto;
    status.enabled = enabled;
    // The demo "booted" with it off.
    status.restartRequired = enabled;
    return HttpResponse.json(status);
  }),
];
