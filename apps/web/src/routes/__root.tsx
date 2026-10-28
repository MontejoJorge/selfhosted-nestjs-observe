import { AppShell } from '@/components/layout/app-shell';
import { NotFound } from '@/components/not-found';
import { TIME_RANGES } from '@/lib/api/scope';
import { optionalEnum, optionalString } from '@/lib/search';
import type { RouterContext } from '@/router';
import {
  createRootRouteWithContext,
  retainSearchParams,
} from '@tanstack/react-router';
import { z } from 'zod';

/** Global filters shared by every page and kept across navigation. */
const globalSearchSchema = z.object({
  service: optionalString,
  range: optionalEnum(TIME_RANGES),
});

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: globalSearchSchema,
  search: {
    middlewares: [retainSearchParams(['service', 'range'])],
  },
  component: AppShell,
  notFoundComponent: NotFound,
});
