import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { ErrorsController } from './errors.controller.js';
import { ErrorsRepository } from './errors.repository.js';
import { PostgresErrorsRepository } from './postgres-errors.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [ErrorsController],
  providers: [
    { provide: ErrorsRepository, useClass: PostgresErrorsRepository },
  ],
})
export class ErrorsModule {}
