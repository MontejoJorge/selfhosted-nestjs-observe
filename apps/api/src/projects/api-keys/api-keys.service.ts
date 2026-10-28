import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApiKey, CreatedApiKey } from '@selfhosted-observe/contracts';
import { generateApiKey } from '../domain/api-key.js';
import { ApiKeyAuthenticator } from './api-key-authenticator.js';
import type { CreateApiKeyDto } from './api-keys.dto.js';
import { ApiKeysRepository } from './api-keys.repository.js';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly keys: ApiKeysRepository,
    private readonly authenticator: ApiKeyAuthenticator,
  ) {}

  /** The plaintext secret is returned here once; only its hash is stored. */
  async create(
    projectId: string,
    input: CreateApiKeyDto,
  ): Promise<CreatedApiKey> {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException('expiresAt must be in the future');
    const generated = generateApiKey();
    const key = await this.keys.insert({
      projectId,
      applicationId: input.applicationId,
      name: input.name,
      keyId: generated.keyId,
      secretHash: generated.secretHash,
      expiresAt,
    });
    if (!key)
      throw new NotFoundException(
        `Application ${input.applicationId} not found in this project`,
      );
    return { ...key, secret: generated.secret };
  }

  async revoke(projectId: string, id: string): Promise<ApiKey> {
    const key = await this.keys.revoke(projectId, id);
    if (!key) throw new NotFoundException(`API key ${id} not found`);
    this.authenticator.evict(key.keyId);
    return key;
  }

  async delete(projectId: string, id: string): Promise<void> {
    const keyId = await this.keys.delete(projectId, id);
    if (!keyId) throw new NotFoundException(`API key ${id} not found`);
    this.authenticator.evict(keyId);
  }
}
