import { api } from '@/lib/api/client';
import type { CreateApiKeyDto } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import { mutationOptions } from '@tanstack/react-query';

export const apiKeysQueryOptions = (project: string) =>
  pagedQueryOptions(['api-keys', 'list', project], (page, signal) =>
    api.projects.listApiKeys({ project, ...page }, { signal }),
  );

export const createApiKeyMutation = (project: string) =>
  mutationOptions({
    mutationFn: (body: CreateApiKeyDto) =>
      api.projects.createApiKey({ project }, body),
  });

export const revokeApiKeyMutation = (project: string) =>
  mutationOptions({
    mutationFn: (keyId: string) =>
      api.projects.revokeApiKey({ project, keyId }),
  });

export const deleteApiKeyMutation = (project: string) =>
  mutationOptions({
    mutationFn: (keyId: string) =>
      api.projects.deleteApiKey({ project, keyId }),
  });
