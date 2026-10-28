import { Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '@selfhosted-observe/contracts';
import { ApplicationPurger } from '../../maintenance/application-purger.js';
import { ApiKeyAuthenticator } from '../api-keys/api-key-authenticator.js';
import { slugify, uniqueSlug } from '../domain/slug.js';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';
import { ProjectsRepository, SlugTakenError } from './projects.repository.js';

/** Attempts at picking a free slug when concurrent creates race for it. */
const SLUG_ATTEMPTS = 5;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly purger: ApplicationPurger,
    private readonly authenticator: ApiKeyAuthenticator,
  ) {}

  async get(ref: string): Promise<Project> {
    const project = await this.projects.findByRef(ref);
    if (!project) throw new NotFoundException(`Project ${ref} not found`);
    return project;
  }

  /** The slug comes from the name; a numeric suffix keeps it unique (`shop`, `shop-2`, ...). */
  async create(input: CreateProjectDto): Promise<Project> {
    const base = slugify(input.name);
    for (let attempt = 1; ; attempt++) {
      const slug = uniqueSlug(base, await this.projects.slugsLike(base));
      try {
        return await this.projects.insert({
          slug,
          name: input.name,
          description: input.description || null,
        });
      } catch (error) {
        if (!(error instanceof SlugTakenError) || attempt >= SLUG_ATTEMPTS)
          throw error;
      }
    }
  }

  async update(ref: string, input: UpdateProjectDto): Promise<Project> {
    const { id } = await this.get(ref);
    const project = await this.projects.update(id, {
      name: input.name,
      description:
        input.description === undefined ? undefined : input.description || null,
    });
    if (!project) throw new NotFoundException(`Project ${ref} not found`);
    return project;
  }

  /** Deletes the project at once; its telemetry is purged in the background. */
  async delete(ref: string): Promise<void> {
    const { id } = await this.get(ref);
    const deleted = await this.projects.delete(id);
    if (!deleted) throw new NotFoundException(`Project ${ref} not found`);
    for (const keyId of deleted.keyIds) this.authenticator.evict(keyId);
    this.purger.trigger();
  }
}
