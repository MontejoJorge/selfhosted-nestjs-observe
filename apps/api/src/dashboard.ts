import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { API_PREFIX } from './app.setup.js';

/**
 * Serves the built dashboard (`apps/web/dist`) from the API, as the Docker image does.
 * Hashed files under `/assets` are cached forever; every other GET that is not an API
 * route falls back to `index.html`, so client-side routes survive a reload.
 */
export function serveDashboard(app: NestExpressApplication, dir: string): void {
  const index = join(dir, 'index.html');
  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader(
        'Cache-Control',
        path.startsWith(join(dir, 'assets'))
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith(`/${API_PREFIX}/`)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
