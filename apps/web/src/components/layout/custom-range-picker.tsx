import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { dataDaysQueryOptions } from '@/features/projects/queries';
import type { Scope } from '@/lib/api/scope';
import { useScope, useSetTimeWindow } from '@/lib/scope-hooks';
import { isCustomWindow, windowLabel } from '@/lib/time-window';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { startOfDay, startOfMonth } from 'date-fns';
import { CalendarIcon, CircleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Matcher } from 'react-day-picker';
import {
  dayHasData,
  draftOf,
  resolveDraft,
  type RangeDraft,
} from './custom-range';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The custom range button of the page header: a calendar over the days with
 * telemetry plus start/end times. Applying sets `from`/`to` in the URL.
 */
export function CustomRangePicker() {
  const scope = useScope();
  const [open, setOpen] = useState(false);
  const custom = isCustomWindow(scope);
  const label = windowLabel(scope);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={custom ? `Custom range: ${label}` : 'Pick a custom range'}
          title={custom ? label : 'Pick a custom range'}
          className={cn(
            'inline-flex h-10 min-w-0 items-center gap-2 rounded-md border px-3 font-mono text-xs font-semibold transition-colors',
            custom
              ? 'border-foreground/25 bg-secondary text-foreground'
              : 'bg-card text-muted-foreground uppercase hover:text-foreground',
          )}
        >
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          {/* Icon only on phones until a custom window is applied. */}
          <span className={cn('truncate', !custom && 'max-sm:sr-only')}>
            {custom ? label : 'Custom'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-auto max-w-[calc(100vw-2rem)] gap-3 p-3"
      >
        <CustomRangeForm scope={scope} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Mounted on open, so the draft always starts from the applied window. */
function CustomRangeForm({
  scope,
  onDone,
}: {
  scope: Scope;
  onDone: () => void;
}) {
  const setWindow = useSetTimeWindow();
  const [draft, setDraft] = useState<RangeDraft>(() =>
    draftOf(scope.from, scope.to),
  );
  const dataDays = useQuery(
    dataDaysQueryOptions(scope.project, scope.application),
  );
  // Fixed while the popover is open; Apply re-checks against the real now.
  const [openedAt] = useState(() => new Date());
  const today = useMemo(() => startOfDay(openedAt), [openedAt]);

  const disabled = useMemo<Matcher[]>(() => {
    const matchers: Matcher[] = [{ after: today }];
    if (dataDays.data) {
      const days = new Set(dataDays.data.days);
      matchers.push((date: Date) => !dayHasData(date, days));
    }
    return matchers;
  }, [today, dataDays.data]);

  const result = resolveDraft(draft, openedAt);
  const oldest = dataDays.data?.oldest;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const applied = resolveDraft(draft);
        if (applied.status !== 'valid') return;
        setWindow.custom(applied.from.toISOString(), applied.to.toISOString());
        onDone();
      }}
    >
      <Calendar
        mode="range"
        selected={draft.days}
        onSelect={(days) => setDraft((prev) => ({ ...prev, days }))}
        disabled={disabled}
        defaultMonth={draft.days?.from ?? today}
        startMonth={oldest ? startOfMonth(new Date(oldest)) : undefined}
        endMonth={today}
        className="p-0"
      />
      <div className="grid grid-cols-2 gap-3">
        <TimeField
          id="custom-range-start"
          label="Start time"
          value={draft.startTime}
          onChange={(startTime) => setDraft((prev) => ({ ...prev, startTime }))}
        />
        <TimeField
          id="custom-range-end"
          label="End time"
          value={draft.endTime}
          onChange={(endTime) => setDraft((prev) => ({ ...prev, endTime }))}
        />
      </div>
      <p className="max-w-64 text-xs text-muted-foreground">
        {dataDays.isError
          ? "Couldn't load the days with data, so every past day is open."
          : 'Days without telemetry are greyed out.'}{' '}
        Times are in {timeZone}.
      </p>
      {result.status === 'invalid' ? (
        <p
          role="alert"
          className="flex max-w-64 items-start gap-2 text-xs text-primary"
        >
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {result.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (isCustomWindow(scope)) {
              setWindow.clearCustom();
              onDone();
            } else {
              setDraft(draftOf(undefined, undefined));
            }
          }}
        >
          Clear
        </Button>
        <Button
          type="submit"
          variant="inverse"
          disabled={result.status !== 'valid'}
        >
          Apply
        </Button>
      </div>
    </form>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={id}
        className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono"
      />
    </div>
  );
}
