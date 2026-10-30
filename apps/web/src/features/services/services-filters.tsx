import {
  FilterBar,
  FilterChip,
  SearchableOptionFilter,
} from '@/components/data/filters';
import { Button } from '@/components/ui/button';
import type { ServiceDto } from '@/lib/api/generated/api';
import type { SearchPatch } from '@/lib/search';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { COMPARISONS, type Comparison, type ServicesSearch } from './search';

const SYMBOLS: Record<Comparison, string> = { gte: '≥', lte: '≤' };

/** Class, own time and total time chips above the Services table. */
export function ServicesFilters({
  services,
  search,
  onChange,
}: {
  services: readonly ServiceDto[];
  search: ServicesSearch;
  onChange: (patch: SearchPatch) => void;
}) {
  const classes = useMemo(
    () =>
      services
        .map((service) => service.className)
        .toSorted((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [services],
  );
  return (
    <FilterBar>
      <SearchableOptionFilter
        label="Class"
        value={search.className}
        options={classes}
        onChange={(className) => onChange({ className })}
        emptyText="No class matches."
      />
      <ThresholdFilter
        label="Own time"
        title="Filter by own time"
        hint="Average per call: own code only, nested calls out"
        op={search.ownOp}
        ms={search.ownMs}
        onChange={(op, ms) => onChange({ ownOp: op, ownMs: ms })}
      />
      <ThresholdFilter
        label="Total time"
        title="Filter by total time"
        hint="Average per call, everything awaited included"
        op={search.totalOp}
        ms={search.totalMs}
        onChange={(op, ms) => onChange({ totalOp: op, totalMs: ms })}
      />
    </FilterBar>
  );
}

/**
 * ≥ / ≤ as two joined buttons. A native <select> here opened the browser's own
 * unstyled list inside the popover; the choice is posted with the form as `op`.
 */
function ComparisonToggle({ defaultValue }: { defaultValue: Comparison }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div
      role="radiogroup"
      aria-label="Comparison"
      className="flex h-9 shrink-0 overflow-hidden rounded-md border"
    >
      <input type="hidden" name="op" value={value} />
      {COMPARISONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={option === 'gte' ? 'At least' : 'At most'}
          onClick={() => setValue(option)}
          className={cn(
            'w-9 text-sm transition-colors outline-none focus-visible:bg-accent',
            value === option
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {SYMBOLS[option]}
        </button>
      ))}
    </div>
  );
}

/** A chip whose popover takes an operator (≥ or ≤) and a value in ms. */
function ThresholdFilter({
  label,
  title,
  hint,
  op,
  ms,
  onChange,
}: {
  label: string;
  title: string;
  hint: string;
  op: Comparison | undefined;
  ms: number | undefined;
  onChange: (op: Comparison | undefined, ms: number | undefined) => void;
}) {
  const current = op ?? 'gte';
  return (
    <FilterChip
      label={label}
      value={ms === undefined ? undefined : `${SYMBOLS[current]} ${ms} ms`}
      onClear={() => onChange(undefined, undefined)}
      contentClassName="w-72 p-3"
    >
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const value = Number(data.get('ms'));
            const nextOp = data.get('op') === 'lte' ? 'lte' : 'gte';
            const valid = data.get('ms') !== '' && Number.isFinite(value);
            onChange(
              valid && nextOp === 'lte' ? 'lte' : undefined,
              valid ? Math.max(0, value) : undefined,
            );
            close();
          }}
        >
          <p className="text-sm font-semibold">{title}</p>
          <div className="flex items-center gap-2">
            <ComparisonToggle defaultValue={current} />
            <div className="flex h-9 flex-1 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/50">
              <input
                name="ms"
                type="number"
                min={0}
                step="any"
                defaultValue={ms ?? ''}
                placeholder="500"
                autoFocus
                aria-label={`${label} in ms`}
                className="h-full w-full min-w-0 bg-transparent px-2 font-mono text-sm outline-none"
              />
              <span className="pr-2 text-sm text-muted-foreground">ms</span>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">{hint}</p>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}
    </FilterChip>
  );
}
