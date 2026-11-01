import { Field, FormError } from '@/components/form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StorageTrimDto } from '@/lib/api/generated/api';
import { formatBytes, formatCount, formatLongDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlertIcon } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  createStoragePurgeMutation,
  createStorageTrimMutation,
  projectStorageQueryOptions,
  storageTrimsQueryOptions,
} from './queries';
import { addDays, trimCutoffDay, utcToday } from './storage-math';

/** Select value for "every application of the project". */
const WHOLE_PROJECT = 'project';
/** What a confirmation of "delete everything" must type. */
const CONFIRM_WORD = 'delete';

type Mode = 'older' | 'all';

function parseKeepDays(value: string, retentionDays: number): number | null {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days < retentionDays
    ? days
    : null;
}

/** Stored rows and size of the target before `cutoffDay`, or all of it without one. */
function DeletionPreview({
  project,
  application,
  cutoffDay,
}: {
  project: string;
  application: string | undefined;
  cutoffDay: string | null;
}) {
  // Non-suspending: the dialog stays usable while another target loads.
  const { data } = useQuery(projectStorageQueryOptions(project, application));
  if (!data) {
    return <p className="text-sm text-muted-foreground">Measuring…</p>;
  }
  const doomed = cutoffDay
    ? data.days.filter((day) => day.day < cutoffDay)
    : data.days;
  if (doomed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {cutoffDay
          ? 'Nothing is stored before that day, so this deletes no rows.'
          : 'No raw telemetry is stored; this still clears charts and errors.'}
      </p>
    );
  }
  const rows = doomed.reduce((sum, day) => sum + day.rows, 0);
  const bytes = doomed.reduce((sum, day) => sum + day.bytes, 0);
  return (
    <p className="text-sm text-foreground">
      About <strong>{formatCount(rows)}</strong> rows and{' '}
      <strong>{formatBytes(bytes)}</strong> of raw telemetry over{' '}
      {doomed.length} {doomed.length === 1 ? 'stored day' : 'stored days'} (
      {formatLongDay(doomed[0].day)}
      {doomed.length > 1
        ? ` to ${formatLongDay(doomed[doomed.length - 1].day)}`
        : ''}
      ).
    </p>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      {children}
    </div>
  );
}

function WarningLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <TriangleAlertIcon
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'older', label: 'Older than…' },
  { value: 'all', label: 'Everything' },
];

function DeleteDataForm({
  project,
  defaultApplication,
  retentionDays,
  onDone,
}: {
  project: string;
  defaultApplication: string | undefined;
  retentionDays: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // The application list of the target select (the page may be narrowed to one).
  const { data: storage } = useQuery(
    projectStorageQueryOptions(project, undefined),
  );
  const applications = storage?.applications ?? [];
  const canTrim = retentionDays >= 2;
  const [mode, setMode] = useState<Mode>(canTrim ? 'older' : 'all');
  const [target, setTarget] = useState(defaultApplication ?? WHOLE_PROJECT);
  const [keepDaysText, setKeepDaysText] = useState(() =>
    String(Math.max(1, Math.floor(retentionDays / 2))),
  );
  const [confirm, setConfirm] = useState('');
  const keepDays = parseKeepDays(keepDaysText, retentionDays);
  const application = target === WHOLE_PROJECT ? undefined : target;
  const today = utcToday();
  const cutoffDay = keepDays === null ? null : trimCutoffDay(keepDays, today);
  const targetName =
    application === undefined
      ? 'every application of this project'
      : (applications.find((a) => a.applicationId === application)?.name ??
        'this application');

  const trims = storageTrimsQueryOptions(project);
  const trim = useMutation({
    ...createStorageTrimMutation(project),
    onSuccess: async (created) => {
      queryClient.setQueryData(
        trims.queryKey,
        (list: StorageTrimDto[] = []) => [
          ...list.filter((item) => item.id !== created.id),
          created,
        ],
      );
      onDone();
      toast.success('Deletion queued');
      await queryClient.invalidateQueries({ queryKey: trims.queryKey });
    },
  });
  const purge = useMutation({
    ...createStoragePurgeMutation(project),
    onSuccess: async () => {
      onDone();
      toast.success('Deleting all the data in the background');
      await queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });
  const pending = trim.isPending || purge.isPending;
  const ready =
    mode === 'older'
      ? keepDays !== null
      : confirm.trim().toLowerCase() === CONFIRM_WORD;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        if (mode === 'all') purge.mutate({ application });
        else if (keepDays !== null) trim.mutate({ keepDays, application });
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Delete data</AlertDialogTitle>
        <AlertDialogDescription>
          Remove the data stored before a day, or all of it. Applications and
          their API keys stay either way.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div role="radiogroup" aria-label="What to delete" className="flex gap-2">
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={value === 'older' && !canTrim}
            onClick={() => setMode(value)}
            className={cn(
              'h-9 flex-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              mode === value
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'bg-card text-muted-foreground enabled:hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'grid gap-4',
          mode === 'older' && 'sm:grid-cols-[minmax(0,1fr)_9rem]',
        )}
      >
        <Field label="Data of" htmlFor="trim-target">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="trim-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_PROJECT}>Whole project</SelectItem>
              {applications.map((app) => (
                <SelectItem key={app.applicationId} value={app.applicationId}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {mode === 'older' ? (
          <Field
            label="Keep last"
            htmlFor="trim-keep-days"
            hint={`1 to ${retentionDays - 1} days`}
          >
            <div className="flex items-center gap-2">
              <Input
                id="trim-keep-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={retentionDays - 1}
                step={1}
                required
                value={keepDaysText}
                aria-invalid={keepDays === null}
                onChange={(event) => setKeepDaysText(event.target.value)}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </Field>
        ) : null}
      </div>

      {mode === 'all' ? (
        <Warning>
          <WarningLine>
            Deletes <strong>all</strong> the data of {targetName}: requests,
            jobs, logs, errors, metrics and profiles, and also the charts and
            stats, error groups, instances and versions. Anything its agents
            send afterwards is stored as usual. This can't be undone.
          </WarningLine>
          <DeletionPreview
            project={project}
            application={application}
            cutoffDay={null}
          />
        </Warning>
      ) : cutoffDay ? (
        <Warning>
          <WarningLine>
            Deletes the data of {targetName} from before{' '}
            <strong>{formatLongDay(cutoffDay)}</strong>. Keeps{' '}
            {formatLongDay(cutoffDay)} through today ({formatLongDay(today)}),
            UTC. Charts and stats keep their rollups. This can't be undone.
          </WarningLine>
          <DeletionPreview
            project={project}
            application={application}
            cutoffDay={cutoffDay}
          />
        </Warning>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter a whole number of days from 1 to {retentionDays - 1}. Retention
          already deletes everything before{' '}
          {formatLongDay(addDays(today, -retentionDays))}.
        </p>
      )}

      {mode === 'all' ? (
        <Field
          label={
            <>
              Type <strong className="font-mono">{CONFIRM_WORD}</strong> to
              confirm
            </>
          }
          htmlFor="purge-confirm"
        >
          <Input
            id="purge-confirm"
            value={confirm}
            autoComplete="off"
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
      ) : null}

      <p className="text-xs text-muted-foreground">
        It runs in the background. Freed space is reused by new telemetry right
        away, but the database files shrink only partly until those days age out
        of retention.
      </p>

      <FormError error={trim.error ?? purge.error} />
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={pending}>
          Cancel
        </AlertDialogCancel>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !ready}
        >
          {mode === 'all' ? 'Delete all data' : 'Delete older data'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * Confirmation dialog to delete a project's data, older than some days or all of it,
 * opened by `children` (the trigger button).
 */
export function TrimDialog({
  project,
  defaultApplication,
  retentionDays,
  children,
}: {
  /** Slug or id. */
  project: string;
  /** The application the page is narrowed to, preselected as the target. */
  defaultApplication?: string;
  retentionDays: number;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        {/* Remounted on open: every dialog starts from the defaults. */}
        {open ? (
          <DeleteDataForm
            project={project}
            defaultApplication={defaultApplication}
            retentionDays={retentionDays}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
