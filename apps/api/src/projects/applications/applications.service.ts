import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationPurger } from '../../maintenance/application-purger.js';
import { ApiKeyAuthenticator } from '../api-keys/api-key-authenticator.js';
import { generateApiKey } from '../domain/api-key.js';
import type {
  ApplicationDto,
  CreateApplicationDto,
  CreatedApplicationDto,
  UpdateApplicationDto,
} from './applications.dto.js';
import {
  ApplicationNameTakenError,
  ApplicationsRepository,
} from './applications.repository.js';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applications: ApplicationsRepository,
    private readonly purger: ApplicationPurger,
    private readonly authenticator: ApiKeyAuthenticator,
  ) {}

  async get(projectId: string, id: string): Promise<ApplicationDto> {
    const application = await this.applications.findById(projectId, id);
    if (!application)
      throw new NotFoundException(`Application ${id} not found`);
    return application;
  }

  /**
   * Creates the application with a first, active API key, so the agent can be
   * configured right away. The key's plaintext secret is returned here once.
   */
  async create(
    projectId: string,
    input: CreateApplicationDto,
  ): Promise<CreatedApplicationDto> {
    const generated = generateApiKey();
    const { application, apiKey } = await this.nameChecked(() =>
      this.applications.insert(
        projectId,
        { name: input.name, tags: input.tags ?? [] },
        {
          name: initialKeyName(input.name),
          keyId: generated.keyId,
          secretHash: generated.secretHash,
        },
      ),
    );
    return Object.assign(application, {
      apiKey: Object.assign(apiKey, { secret: generated.secret }),
    });
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateApplicationDto,
  ): Promise<ApplicationDto> {
    const application = await this.nameChecked(() =>
      this.applications.update(projectId, id, {
        name: input.name,
        tags: input.tags,
      }),
    );
    if (!application)
      throw new NotFoundException(`Application ${id} not found`);
    return application;
  }

  /** Deletes the application and its keys at once; its telemetry is purged in the background. */
  async delete(projectId: string, id: string): Promise<void> {
    const deleted = await this.applications.delete(projectId, id);
    if (!deleted) throw new NotFoundException(`Application ${id} not found`);
    for (const keyId of deleted.keyIds) this.authenticator.evict(keyId);
    this.purger.trigger();
  }

  private async nameChecked<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof ApplicationNameTakenError) {
        throw new ConflictException(
          `An application named "${error.message}" already exists in this project`,
        );
      }
      throw error;
    }
  }
}

const KEY_NAME_SUFFIX = ' agent';
const MAX_KEY_NAME_LENGTH = 100;

/** "<application name> agent", shortening the name to fit the key name limit (in code points). */
function initialKeyName(applicationName: string): string {
  const chars = Array.from(applicationName);
  return (
    chars.slice(0, MAX_KEY_NAME_LENGTH - KEY_NAME_SUFFIX.length).join('') +
    KEY_NAME_SUFFIX
  );
}
