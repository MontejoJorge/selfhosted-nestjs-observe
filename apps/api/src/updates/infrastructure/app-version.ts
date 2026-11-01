import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Version of the running collector, from the nearest `package.json` above this module:
 * `apps/api/package.json` from `src/` or `dist/`, and `/app/package.json` in the Docker
 * image (the API's, copied by `pnpm deploy`).
 */
export function readAppVersion(from: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(from));
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      const { version } = JSON.parse(readFileSync(file, 'utf8')) as {
        version?: unknown;
      };
      if (typeof version !== 'string')
        throw new Error(`${file} has no version`);
      return version;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('No package.json above the API');
    dir = parent;
  }
}
