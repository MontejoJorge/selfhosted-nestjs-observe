import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../app.module.js';
import { applyGlobalPrefix } from '../app.setup.js';
import { createOpenApiDocument } from './openapi.js';

/**
 * Writes the query API's OpenAPI document to `apps/api/openapi.json`.
 * Preview mode builds the module graph without instantiating providers, so no
 * database connection is needed. Run from the compiled output: the swagger CLI
 * plugin metadata only exists after `nest build`.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: ['error'],
  });
  applyGlobalPrefix(app);
  const document = createOpenApiDocument(app);
  await app.close();

  const output = resolve(import.meta.dirname, '../../openapi.json');
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI document written to ${output}`);
}

await generate();
