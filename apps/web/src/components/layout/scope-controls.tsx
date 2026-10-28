import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { applicationsQueryOptions } from '@/features/applications/queries';
import { useLive } from '@/features/live/live-context';
import { TIME_RANGES } from '@/lib/api/scope';
import { useRange, useScope } from '@/lib/scope-hooks';
import { applySearchPatch } from '@/lib/search';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

const ALL_APPLICATIONS = '__all__';

/**
 * "All applications" or one application of the current project (`?application=<id>`).
 * With `defaultApplication`, one app is always selected (pages that need one, like
 * the Profiler): the "All" option is hidden and the default shows when the URL has none.
 */
export function ApplicationSelect({
  defaultApplication,
}: {
  defaultApplication?: string;
}) {
  const { project, application, range } = useScope();
  const [, setParams] = useSearchParams();
  const applications = useQuery(applicationsQueryOptions(project, range));
  const options = applications.data?.items ?? [];
  const value = application ?? defaultApplication ?? ALL_APPLICATIONS;

  return (
    <Select
      value={value}
      onValueChange={(value) =>
        setParams((prev) =>
          applySearchPatch(prev, {
            application: value === ALL_APPLICATIONS ? undefined : value,
            // An instance belongs to one application (Profiler).
            instance: undefined,
          }),
        )
      }
    >
      <SelectTrigger
        className="h-10! w-full rounded-md bg-card text-[13px] font-semibold sm:w-60"
        aria-label="Application"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {defaultApplication === undefined ? (
          <SelectItem value={ALL_APPLICATIONS}>All applications</SelectItem>
        ) : null}
        {value !== ALL_APPLICATIONS &&
        !options.some((app) => app.id === value) ? (
          // Keep the URL's application selectable before the list has loaded.
          <SelectItem value={value}>
            {applications.isPending ? 'Loading…' : 'Unknown application'}
          </SelectItem>
        ) : null}
        {options.map((app) => (
          <SelectItem key={app.id} value={app.id}>
            <span className="truncate">{app.name}</span>
          </SelectItem>
        ))}
        {applications.isError ? (
          <div className="px-2 py-1.5 text-xs text-destructive">
            Could not load applications
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}

/** Auto-refresh toggle. */
export function LivePill() {
  const {
    state: { live },
    actions: { setLive },
  } = useLive();
  return (
    <button
      type="button"
      aria-pressed={live}
      title={
        live
          ? 'Auto-refresh every 10 s (click to pause)'
          : 'Enable auto-refresh'
      }
      onClick={() => setLive(!live)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border px-4 font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors',
        live
          ? 'border-teal/50 bg-teal/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          live ? 'animate-pulse bg-teal' : 'bg-muted-foreground',
        )}
      />
      Live
    </button>
  );
}

/** Segmented control over the time ranges the API supports. */
export function RangeSegmented() {
  const range = useRange();
  const [, setParams] = useSearchParams();
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="inline-flex h-10 overflow-hidden rounded-md border bg-card"
    >
      {TIME_RANGES.map((value) => {
        const active = value === range;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() =>
              setParams((prev) => applySearchPatch(prev, { range: value }))
            }
            className={cn(
              'min-w-12 border-l px-3 font-mono text-xs font-semibold uppercase first:border-l-0 transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

/** The right side of a project page header: application, live and time range. */
export function ScopeControls({
  defaultApplication,
}: {
  /** See ApplicationSelect. */
  defaultApplication?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ApplicationSelect defaultApplication={defaultApplication} />
      <LivePill />
      <RangeSegmented />
    </div>
  );
}
