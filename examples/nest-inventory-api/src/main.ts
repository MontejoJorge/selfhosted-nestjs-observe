import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('API_PORT', { infer: true }));
}
await bootstrap();
