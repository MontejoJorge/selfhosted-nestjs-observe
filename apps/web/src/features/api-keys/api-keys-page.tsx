import { ConfirmDialog } from '@/components/confirm-dialog';
import { DotPill } from '@/components/data/badges';
import { MessageRow, TableFrame } from '@/components/data/data-table';
import {
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { Page, PageActions, PageHeader } from '@/components/page';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { applicationsQueryOptions } from '@/features/applications/queries';
import { ProjectTitle } from '@/features/projects/project-title';
import type { ApiKeyDto, ApiKeyStatus } from '@/lib/api/generated/api';
import { formatRelative } from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { EllipsisVerticalIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AddKeyDialog } from './add-key-dialog';
import {
  apiKeysQueryOptions,
  deleteApiKeyMutation,
  revokeApiKeyMutation,
} from './queries';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

const STATUS_TONE = {
  active: 'ok',
  expired: 'warn',
  revoked: 'error',
} as const satisfies Record<ApiKeyStatus, string>;

const STATUS_OPTIONS = (['active', 'expired', 'revoked'] as const).map(
  (value) => ({ value, label: STATUS_LABEL[value] }),
);

type Pending = { kind: 'revoke' | 'delete'; key: ApiKeyDto } | null;

export function ApiKeysPage() {
  const { project, range } = useScope();
  const queryClient = useQueryClient();
  const query = useSuspenseInfiniteQuery(apiKeysQueryOptions(project));
  const { data: applications } = useSuspenseQuery(
    applicationsQueryOptions(project, range),
  );
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [name, setName] = useState<string>();
  const [applicationId, setApplicationId] = useState<string>();
  const [status, setStatus] = useState<ApiKeyStatus>();

  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success(message);
    setPending(null);
  };
  const revoke = useMutation({
    ...revokeApiKeyMutation(project),
    onSuccess: () => done('Key revoked'),
  });
  const remove = useMutation({
    ...deleteApiKeyMutation(project),
    onSuccess: () => done('Key deleted'),
  });
  const action = pending?.kind === 'revoke' ? revoke : remove;

  const all = query.data.pages.flatMap((page) => page.items);
  const keys = all.filter(
    (key) =>
      (!name || key.name.toLowerCase().includes(name.toLowerCase())) &&
      (!applicationId || key.applicationId === applicationId) &&
      (!status || key.status === status),
  );
  const appOptions = applications.items.map((app) => ({
    value: app.id,
    label: app.name,
  }));

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="View and manage your project API keys.">
          API Keys
        </ProjectTitle>
        <PageActions>
          <Button
            variant="inverse"
            size="xl"
            disabled={applications.items.length === 0}
            title={
              applications.items.length === 0
                ? 'Create an application first'
                : undefined
            }
            onClick={() => setAdding(true)}
          >
            <PlusIcon /> Add key
          </Button>
        </PageActions>
      </PageHeader>

      <FilterBar>
        <InputFilter
          label="Name"
          value={name}
          placeholder="Name contains…"
          onChange={setName}
        />
        <OptionFilter
          label="Application"
          value={applicationId}
          options={appOptions}
          onChange={setApplicationId}
        />
        <OptionFilter
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
      </FilterBar>

      {all.length === 0 ? (
        <EmptyState title="No API keys yet">
          {applications.items.length === 0
            ? 'Create an application first, then add a key for its agent.'
            : 'Add a key and configure the agent with its id and secret.'}
        </EmptyState>
      ) : (
        <TableFrame
          footer={
            query.hasNextPage ? (
              <LoadMore
                shown={all.length}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
              />
            ) : undefined
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Key ID</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="h-16!">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{key.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {key.applicationName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DotPill
                      tone={STATUS_TONE[key.status]}
                      className="font-sans"
                    >
                      {STATUS_LABEL[key.status]}
                    </DotPill>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {key.keyId}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastUsedAt ? formatRelative(key.lastUsedAt) : 'Never'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {key.expiresAt
                      ? dateFormat.format(new Date(key.expiresAt))
                      : 'No expiry'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateFormat.format(new Date(key.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${key.name}`}
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {key.status === 'active' ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              revoke.reset();
                              setPending({ kind: 'revoke', key });
                            }}
                          >
                            Revoke
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            remove.reset();
                            setPending({ kind: 'delete', key });
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 ? (
                <MessageRow colSpan={7}>
                  No key matches these filters.
                </MessageRow>
              ) : null}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      <AddKeyDialog
        open={adding}
        onOpenChange={setAdding}
        project={project}
        applications={applications.items}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === 'revoke'
            ? `Revoke “${pending.key.name}”?`
            : `Delete “${pending?.key.name ?? ''}”?`
        }
        confirmLabel={pending?.kind === 'revoke' ? 'Revoke key' : 'Delete key'}
        pending={action.isPending}
        error={action.error}
        onConfirm={() => pending && action.mutate(pending.key.id)}
      >
        <p>
          {pending?.kind === 'revoke'
            ? 'Agents using this key get 401 from now on. The key stays listed as revoked.'
            : 'The key is removed for good and agents using it get 401.'}
        </p>
      </ConfirmDialog>
    </Page>
  );
}
