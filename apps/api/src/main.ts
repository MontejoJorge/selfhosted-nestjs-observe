import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { API_PREFIX, applyGlobalPrefix } from './app.setup.js';
import type { Env } from './config/env.js';
import { createOpenApiDocument } from './openapi/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Telemetry batches are gzip JSON up to ~16 MB. express.json inflates gzip/deflate
  // bodies by itself (inflate: true) based on Content-Encoding.
  app.useBodyParser('json', { limit: '20mb', inflate: true });

  // Ingest routes keep the paths the agent expects; the query API lives under /api.
  applyGlobalPrefix(app);
  // Any origin may call the API: the dashboard can be served from anywhere, and the
  // ingest routes are authenticated by API key, not by cookies.
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();

  // Swagger UI at /api/docs, JSON at /api/docs-json.
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () =>
    createOpenApiDocument(app),
  );

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}
await bootstrap();
