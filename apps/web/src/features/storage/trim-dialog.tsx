import { Field, FormError } from '@/components/form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import type {
  ApplicationUsageDto,
  StorageTrimDto,
} from '@/lib/api/generated/api';
import { formatBytes, formatCount, formatLongDay } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EraserIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  createStorageTrimMutation,
  projectStorageQueryOptions,
  storageTrimsQueryOptions,
} from './queries';
import { addDays, trimCutoffDay, utcToday } from './storage-math';

/** Select value for "every application of the project". */
const WHOLE_PROJECT = 'project';

function parseKeepDays(value: string, retentionDays: number): number | null {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days < retentionDays
    ? days
    : null;
}

/** What the trim would delete, from the stored days of the target. */
function TrimPreview({
  project,
  application,
  cutoffDay,
}: {
  project: string;
  application: string | undefined;
  cutoffDay: string;
}) {
  // Non-suspending: the dialog stays usable while another target loads.
  const { data } = useQuery(projectStorageQueryOptions(project, application));
  if (!data) {
    return <p className="text-sm text-muted-foreground">Measuring…</p>;
  }
  const doomed = data.days.filter((day) => day.day < cutoffDay);
  if (doomed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is stored before that day, so this deletes no rows.
      </p>
    );
  }
  const rows = doomed.reduce((sum, day) => sum + day.rows, 0);
  const bytes = doomed.reduce((sum, day) => sum + day.bytes, 0);
  return (
    <p className="text-sm text-foreground">
      About <strong>{formatCount(rows)}</strong> rows and{' '}
      <strong>{formatBytes(bytes)}</strong> over {doomed.length}{' '}
      {doomed.length === 1 ? 'stored day' : 'stored days'} (
      {formatLongDay(doomed[0].day)}
      {doomed.length > 1
        ? ` to ${formatLongDay(doomed[doomed.length - 1].day)}`
        : ''}
      ).
    </p>
  );
}

function TrimForm({
  project,
  applications,
  defaultApplication,
  retentionDays,
  onDone,
}: {
  project: string;
  applications: readonly ApplicationUsageDto[];
  defaultApplication: string | undefined;
  retentionDays: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(defaultApplication ?? WHOLE_PROJECT);
  const [keepDaysText, setKeepDaysText] = useState(() =>
    String(Math.max(1, Math.floor(retentionDays / 2))),
  );
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
  const mutation = useMutation({
    ...createStorageTrimMutation(project),
    onSuccess: async (trim) => {
      queryClient.setQueryData(
        trims.queryKey,
        (list: StorageTrimDto[] = []) => [
          ...list.filter((item) => item.id !== trim.id),
          trim,
        ],
      );
      onDone();
      toast.success('Deletion queued');
      await queryClient.invalidateQueries({ queryKey: trims.queryKey });
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (keepDays === null) return;
        mutation.mutate({ keepDays, application });
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Delete old data</AlertDialogTitle>
        <AlertDialogDescription>
          Removes the requests, jobs, logs, errors, metrics and profiles stored
          before a day. Charts and stats keep their rollups.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
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
      </div>

      {cutoffDay ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlertIcon
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <span>
              Deletes the data of {targetName} from before{' '}
              <strong>{formatLongDay(cutoffDay)}</strong>. Keeps{' '}
              {formatLongDay(cutoffDay)} through today ({formatLongDay(today)}),
              UTC. This can't be undone.
            </span>
          </p>
          <TrimPreview
            project={project}
            application={application}
            cutoffDay={cutoffDay}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter a whole number of days from 1 to {retentionDays - 1}. Retention
          already deletes everything before{' '}
          {formatLongDay(addDays(today, -retentionDays))}.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        It runs in the background. Freed space is reused by new telemetry right
        away, but the database files shrink only partly until those days age out
        of retention.
      </p>

      <FormError error={mutation.error} />
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={mutation.isPending}>
          Cancel
        </AlertDialogCancel>
        <Button
          type="submit"
          variant="destructive"
          disabled={mutation.isPending || keepDays === null}
        >
          Delete older data
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/** "Delete old data" button and its confirmation dialog. */
export function TrimDialog({
  project,
  applications,
  defaultApplication,
  retentionDays,
}: {
  project: string;
  applications: readonly ApplicationUsageDto[];
  /** The application the page is narrowed to, preselected as the target. */
  defaultApplication: string | undefined;
  retentionDays: number;
}) {
  const [open, setOpen] = useState(false);
  const disabled = retentionDays < 2;
  return (
    <>
      <Button
        variant="destructive"
        size="xl"
        disabled={disabled}
        title={
          disabled ? 'Retention keeps a single day: nothing to trim' : undefined
        }
        onClick={() => setOpen(true)}
      >
        <EraserIcon /> Delete old data
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
          {/* Remounted on open: every dialog starts from the defaults. */}
          {open ? (
            <TrimForm
              project={project}
              applications={applications}
              defaultApplication={defaultApplication}
              retentionDays={retentionDays}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
