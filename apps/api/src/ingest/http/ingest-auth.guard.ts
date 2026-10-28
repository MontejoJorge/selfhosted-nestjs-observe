import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.js';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison (hashing first makes lengths equal). */
function safeEqual(actual: string | undefined, expected: string): boolean {
  return (
    actual !== undefined && timingSafeEqual(digest(actual), digest(expected))
  );
}

/**
 * When INGEST_API_KEY / INGEST_API_SECRET are set, ingest requests must send matching
 * `x-api-key` / `x-api-secret` headers. The agent backs off on 401.
 */
@Injectable()
export class IngestAuthGuard implements CanActivate {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('INGEST_API_KEY', { infer: true });
    this.apiSecret = config.get('INGEST_API_SECRET', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey && !this.apiSecret) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const keyOk = !this.apiKey || safeEqual(header('x-api-key'), this.apiKey);
    const secretOk =
      !this.apiSecret || safeEqual(header('x-api-secret'), this.apiSecret);
    if (!keyOk || !secretOk)
      throw new UnauthorizedException('Invalid ingest credentials');
    return true;
  }
}
