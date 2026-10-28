import { Module } from '@nestjs/common';
import { ScopeResolver } from './scope.js';

/** Shared by the telemetry feature modules to resolve `project` / `application`. */
@Module({
  providers: [ScopeResolver],
  exports: [ScopeResolver],
})
export class ScopeModule {}
