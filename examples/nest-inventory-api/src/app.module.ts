import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import type { Request } from 'express';
import { Env, validateEnv } from './config/env.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PokemonModule } from './pokemon/pokemon.module.js';
import { StockModule } from './stock/stock.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      cache: true,
      validate: validateEnv,
    }),
    // Options are read from ConfigService, so `.env` is loaded and validated
    // (see config/env.ts) before the agent starts.
    ObserveModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        appKey: config.get('OBSERVE_APP_KEY', { infer: true }),
        appSecret: config.get('OBSERVE_APP_SECRET', { infer: true }),
        endpoint: config.get('OBSERVE_ENDPOINT', { infer: true }),
        serviceId: 'nest-inventory-api',
        forwardLogs: true,
        http: {
          // Requests without the header return undefined, which the agent
          // records as anonymous (the option is typed as returning a string).
          getUserId: (req: Request) => req.header('x-user-id') as string,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    PokemonModule,
    CatalogModule,
    StockModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
