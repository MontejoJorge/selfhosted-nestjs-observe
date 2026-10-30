import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { applicationsQueryOptions } from '@/features/applications/queries';
import { useLive } from '@/features/live/live-context';
import { useRangePresets } from '@/features/projects/use-range-presets';
import { TIME_RANGE_INFO, TIME_RANGES } from '@/lib/api/scope';
import { useScope, useSetTimeWindow, useTimeWindow } from '@/lib/scope-hooks';
import { applySearchPatch } from '@/lib/search';
import { isCustomWindow } from '@/lib/time-window';
import { cn } from '@/lib/utils';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CustomRangePicker } from './custom-range-picker';

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
  const scope = useScope();
  const { project, application } = scope;
  const [, setParams] = useSearchParams();
  const applications = useQuery(applicationsQueryOptions(project, scope));
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

/** Auto-refresh toggle; off while a custom window with a fixed end is shown. */
export function LivePill() {
  const {
    state: { live, paused },
    actions: { setLive },
  } = useLive();
  const on = live && !paused;
  const pill = (
    <button
      type="button"
      aria-pressed={on}
      disabled={paused}
      title={
        paused
          ? undefined
          : live
            ? 'Auto-refresh every 10 s (click to pause)'
            : 'Enable auto-refresh'
      }
      onClick={() => setLive(!live)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border px-4 font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on
          ? 'border-teal/50 bg-teal/10 text-foreground'
          : 'border-border bg-card text-muted-foreground enabled:hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          on ? 'animate-pulse bg-teal' : 'bg-muted-foreground',
        )}
      />
      Live
    </button>
  );
  if (!paused) return pill;
  // A disabled button gets no pointer events: the wrapper carries the tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          {pill}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        A custom range has a fixed end, so there is nothing new to load. Pick a
        preset range to turn LIVE back on.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The project's three quick ranges (Settings). A preset in the URL that is not
 * one of them (a shared link) shows as an extra segment, in order; a custom
 * window leaves every segment off (the custom button shows it).
 */
export function RangeSegmented() {
  const timeWindow = useTimeWindow();
  const presets = useRangePresets();
  const setWindow = useSetTimeWindow();
  const custom = isCustomWindow(timeWindow);
  const segments =
    custom || presets.includes(timeWindow.range)
      ? presets
      : TIME_RANGES.filter(
          (value) => presets.includes(value) || value === timeWindow.range,
        );
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="inline-flex h-10 shrink-0 overflow-hidden rounded-md border bg-card"
    >
      {segments.map((value) => {
        const active = !custom && value === timeWindow.range;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={TIME_RANGE_INFO[value].label}
            title={TIME_RANGE_INFO[value].label}
            onClick={() => setWindow.preset(value)}
            className={cn(
              'min-w-12 border-l px-3 font-mono text-xs font-semibold uppercase first:border-l-0 transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {TIME_RANGE_INFO[value].short}
          </button>
        );
      })}
    </div>
  );
}

/** How long the check mark shows after a refresh completes. */
const REFRESHED_MS = 1200;

/**
 * Refetches the queries the current page has mounted (its scope: project,
 * application, range and filters). The icon spins while any of them is
 * fetching, then shows a check for a moment.
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ type: 'active' }) > 0;
  const [phase, setPhase] = useState<'idle' | 'refreshing' | 'done'>('idle');
  const spinning = fetching || phase === 'refreshing';

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setPhase('idle'), REFRESHED_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const label = spinning ? 'Refreshing data' : 'Refresh data';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-busy={spinning}
      disabled={spinning}
      onClick={async () => {
        setPhase('refreshing');
        await queryClient.invalidateQueries({ type: 'active' });
        setPhase('done');
      }}
      className="inline-grid size-10 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
    >
      {phase === 'done' && !spinning ? (
        <CheckIcon className="size-4 text-teal" aria-hidden />
      ) : (
        <RefreshCwIcon
          className={cn('size-4', spinning && 'animate-spin')}
          aria-hidden
        />
      )}
    </button>
  );
}

/** The right side of a project page header: application, live, time range, custom range and refresh. */
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
      <CustomRangePicker />
      <RefreshButton />
    </div>
  );
}
