import { Injectable, NotFoundException } from '@nestjs/common';
import { generateApiKey } from '../domain/api-key.js';
import { ApiKeyAuthenticator } from './api-key-authenticator.js';
import type {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from './api-keys.dto.js';
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
  ): Promise<CreatedApiKeyDto> {
    const generated = generateApiKey();
    const key = await this.keys.insert({
      projectId,
      applicationId: input.applicationId,
      name: input.name,
      keyId: generated.keyId,
      secretHash: generated.secretHash,
    });
    if (!key)
      throw new NotFoundException(
        `Application ${input.applicationId} not found in this project`,
      );
    return Object.assign(key, { secret: generated.secret });
  }

  async revoke(projectId: string, id: string): Promise<ApiKeyDto> {
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
