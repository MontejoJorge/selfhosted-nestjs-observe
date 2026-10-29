import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyAuthenticator } from '../../projects/api-keys/api-key-authenticator.js';

type IngestRequest = Request & { applicationId?: string };

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Ingest requests must carry the `x-api-key` / `x-api-secret` of an active API key. The
 * key identifies the application the telemetry belongs to. Missing, unknown, wrong,
 * revoked credentials are a 401, on which the agent backs off.
 */
@Injectable()
export class IngestAuthGuard implements CanActivate {
  constructor(private readonly authenticator: ApiKeyAuthenticator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IngestRequest>();
    const applicationId = await this.authenticator.authenticate(
      header(request, 'x-api-key'),
      header(request, 'x-api-secret'),
    );
    if (!applicationId)
      throw new UnauthorizedException('Invalid ingest credentials');
    request.applicationId = applicationId;
    return true;
  }
}

/** Application id resolved by `IngestAuthGuard`. */
export const IngestApplication = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const { applicationId } = context
      .switchToHttp()
      .getRequest<IngestRequest>();
    if (!applicationId) throw new UnauthorizedException();
    return applicationId;
  },
);
