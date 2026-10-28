import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Telemetry batches are gzip JSON up to ~16 MB. express.json inflates gzip/deflate
  // bodies by itself (inflate: true) based on Content-Encoding.
  app.useBodyParser('json', { limit: '20mb', inflate: true });

  // Ingest routes keep the paths the agent expects; the query API lives under /api.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'applications/telemetry', method: RequestMethod.POST },
      { path: 'applications/profiles', method: RequestMethod.POST },
    ],
  });
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}
await bootstrap();
