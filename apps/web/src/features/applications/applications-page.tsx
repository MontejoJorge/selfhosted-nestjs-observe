import { Sparkline } from '@/components/charts/sparkline';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TagChip } from '@/components/data/badges';
import { MessageRow, NumCell, TableFrame } from '@/components/data/data-table';
import {
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { Meter } from '@/components/data/metric-cells';
import { Page, PageActions, PageHeader } from '@/components/page';
import { CountBadge } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ProjectTitle } from '@/features/projects/project-title';
import type { ApplicationSummaryDto } from '@/lib/api/generated/api';
import { formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { EllipsisVerticalIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ApplicationFormDialog } from './application-form-dialog';
import {
  applicationsQueryOptions,
  createApplicationMutation,
  deleteApplicationMutation,
  updateApplicationMutation,
} from './queries';

/** An app counts as active when it reported in the last 15 minutes. */
const ACTIVE_WINDOW_MS = 15 * 60_000;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; app: ApplicationSummaryDto }
  | { kind: 'delete'; app: ApplicationSummaryDto }
  | null;

export function ApplicationsPage() {
  const { project, range } = useScope();
  // When the data was fetched: the reference for "active".
  const { data, dataUpdatedAt: now } = useSuspenseQuery(
    applicationsQueryOptions(project, range),
  );
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState<string>();
  const [status, setStatus] = useState<'active' | 'inactive'>();
  const [tag, setTag] = useState<string>();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['applications'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  const close = () => setDialog(null);
  const create = useMutation({
    ...createApplicationMutation(project),
    onSuccess: async (app) => {
      await invalidate();
      toast.success(`Application “${app.name}” created`, {
        description: 'Generate an API key for it in API keys.',
      });
      close();
    },
  });
  const update = useMutation({
    ...updateApplicationMutation(project),
    onSuccess: async () => {
      await invalidate();
      toast.success('Application updated');
      close();
    },
  });
  const remove = useMutation({
    ...deleteApplicationMutation(project),
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
      ]);
      toast.success('Application deleted');
      close();
    },
  });

  const tags = useMemo(
    () =>
      [...new Set(data.items.flatMap((app) => app.tags))]
        .toSorted()
        .map((t) => ({ value: t, label: t })),
    [data],
  );
  const isActive = (app: ApplicationSummaryDto) =>
    app.lastSeenAt !== null &&
    now - new Date(app.lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
  const apps = data.items.filter(
    (app) =>
      (!name || app.name.toLowerCase().includes(name.toLowerCase())) &&
      (!status || isActive(app) === (status === 'active')) &&
      (!tag || app.tags.includes(tag)),
  );

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Each application represents a separate Nest service.">
          My applications <CountBadge>{data.items.length}</CountBadge>
        </ProjectTitle>
        <PageActions>
          <Button
            variant="inverse"
            size="xl"
            onClick={() => {
              create.reset();
              setDialog({ kind: 'create' });
            }}
          >
            <PlusIcon /> Create application
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
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <OptionFilter
          label="Tags"
          value={tag}
          options={tags}
          onChange={setTag}
        />
      </FilterBar>

      {data.items.length === 0 ? (
        <EmptyState title="No applications yet">
          Create an application for each Nest service, then add an API key for
          its agent.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>Memory</TableHead>
                <TableHead className="text-right">Req/s</TableHead>
                <TableHead className="text-right">Error rate</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    <ScopedLink
                      to={paths.project(project)}
                      search={{ application: app.id }}
                      className="hover:underline"
                    >
                      {app.name}
                    </ScopedLink>
                  </TableCell>
                  <TableCell className="w-28">
                    <Sparkline
                      values={app.activity.map((bucket) => bucket.count)}
                      className="h-6 w-16"
                    />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {app.lastSeenAt ? formatRelative(app.lastSeenAt) : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Meter percent={app.cpuPercent} />
                  </TableCell>
                  <TableCell>
                    <Meter percent={app.memoryPercent} />
                  </TableCell>
                  <NumCell>{app.requestsPerSecond.toFixed(2)}</NumCell>
                  <NumCell
                    className={cn(app.errorRate >= 0.01 && 'text-primary')}
                  >
                    {(app.errorRate * 100).toFixed(2)}%
                  </NumCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {app.tags.map((t) => (
                        <TagChip key={t}>{t}</TagChip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${app.name}`}
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <ScopedLink
                            to={paths.requests(project)}
                            search={{ application: app.id }}
                          >
                            View requests
                          </ScopedLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <ScopedLink
                            to={paths.profiler(project)}
                            search={{ application: app.id }}
                          >
                            Open profiler
                          </ScopedLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            update.reset();
                            setDialog({ kind: 'edit', app });
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            remove.reset();
                            setDialog({ kind: 'delete', app });
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {apps.length === 0 ? (
                <MessageRow colSpan={9}>
                  No application matches these filters.
                </MessageRow>
              ) : null}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      <ApplicationFormDialog
        open={dialog?.kind === 'create'}
        onOpenChange={(open) => !open && close()}
        title="Create application"
        description="An application is one Nest service. Its agents authenticate with an API key of this application."
        submitLabel="Create application"
        initial={{ name: '', tags: [] }}
        pending={create.isPending}
        error={create.error}
        onSubmit={(values) => create.mutate(values)}
      />
      <ApplicationFormDialog
        open={dialog?.kind === 'edit'}
        onOpenChange={(open) => !open && close()}
        title="Edit application"
        description="Rename the application or change its tags."
        submitLabel="Save changes"
        initial={
          dialog?.kind === 'edit'
            ? { name: dialog.app.name, tags: dialog.app.tags }
            : { name: '', tags: [] }
        }
        pending={update.isPending}
        error={update.error}
        onSubmit={(values) =>
          dialog?.kind === 'edit' &&
          update.mutate({ applicationId: dialog.app.id, ...values })
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${dialog?.kind === 'delete' ? dialog.app.name : 'application'}?`}
        confirmLabel="Delete application"
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          dialog?.kind === 'delete' && remove.mutate(dialog.app.id)
        }
      >
        <p>
          Its API keys stop working immediately and agents using them get 401.
          This can't be undone.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
