import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/**
 * OpenAPI document of the query API (the ingest routes are excluded). Works on an app
 * created with `{ preview: true }`, so it can be generated without a database.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Selfhosted Observe API')
    .setDescription(
      'Query API of the self-hosted @nestjs/observe collector. Timestamps are ISO strings, durations are milliseconds.',
    )
    .setVersion('0.0.1')
    .build();
  return SwaggerModule.createDocument(app, config);
}
