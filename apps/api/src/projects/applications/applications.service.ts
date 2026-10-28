import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationPurger } from '../../maintenance/application-purger.js';
import { ApiKeyAuthenticator } from '../api-keys/api-key-authenticator.js';
import type {
  ApplicationDto,
  CreateApplicationDto,
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

  create(
    projectId: string,
    input: CreateApplicationDto,
  ): Promise<ApplicationDto> {
    return this.nameChecked(() =>
      this.applications.insert(projectId, {
        name: input.name,
        tags: input.tags ?? [],
      }),
    );
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
