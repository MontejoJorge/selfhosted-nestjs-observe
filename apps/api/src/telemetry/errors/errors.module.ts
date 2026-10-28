import { Module } from '@nestjs/common';
import { ErrorsController } from './errors.controller.js';
import { ErrorsRepository } from './errors.repository.js';
import { PostgresErrorsRepository } from './postgres-errors.repository.js';

@Module({
  controllers: [ErrorsController],
  providers: [
    { provide: ErrorsRepository, useClass: PostgresErrorsRepository },
  ],
})
export class ErrorsModule {}
