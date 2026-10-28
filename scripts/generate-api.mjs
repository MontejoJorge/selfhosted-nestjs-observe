#!/usr/bin/env node
/**
 * Generates the dashboard's typed API client from the API's OpenAPI document.
 *
 *   node scripts/generate-api.mjs                 # rebuild openapi.json from the API, then the client
 *   node scripts/generate-api.mjs --client-only   # client only, from the committed openapi.json
 *
 * `apps/api/openapi.json` is committed (it is the contract and is reviewed in
 * PRs); the generated client is gitignored and regenerated before web dev/build.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateApi } from 'swagger-typescript-api';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = resolve(root, 'apps/api/openapi.json');
const output = resolve(root, 'apps/web/src/lib/api/generated');
const clientOnly = process.argv.includes('--client-only');

if (!clientOnly) {
  execSync('pnpm --filter api openapi:generate', {
    cwd: root,
    stdio: 'inherit',
  });
}

if (!existsSync(spec)) {
  console.error(
    `Missing ${spec}. Run "pnpm api:generate" to build it from the API.`,
  );
  process.exit(1);
}

await generateApi({
  input: spec,
  output,
  fileName: 'api.ts',
  httpClientType: 'axios',
  // Methods resolve to the response body instead of the AxiosResponse.
  unwrapResponseData: true,
  // Inline enums become named types; as unions they accept plain strings
  // (e.g. a TimeRange read from the URL) without casting.
  extractEnums: true,
  generateUnionEnums: true,
  extractRequestParams: true,
  extractRequestBody: true,
  // /api/requests/... -> api.requests.listRequests(); index 0 would be "api".
  moduleNameIndex: 1,
  sortTypes: true,
  sortRoutes: true,
  cleanOutput: true,
  silent: true,
});

console.log(`API client written to ${output}`);
