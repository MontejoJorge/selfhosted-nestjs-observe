import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CheckIcon,
  PlusCircleIcon,
  SearchIcon,
  XCircleIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** The row above a table: dashed filter chips on the left, search on the right. */
export function FilterBar({
  children,
  aside,
}: {
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {aside ? <div className="ml-auto">{aside}</div> : null}
    </div>
  );
}

const chip =
  'inline-flex h-7 max-w-80 items-center gap-1.5 rounded-md border border-dashed border-foreground/25 px-2 text-[13px] font-semibold transition-colors hover:border-foreground/50';

/**
 * A dashed chip that opens a popover. Inactive it reads "⊕ Label"; with a value it
 * reads "⊗ Label | value" in the accent color and the ⊗ clears it.
 */
export function FilterChip({
  label,
  value,
  onClear,
  children,
  contentClassName,
}: {
  label: string;
  /** Display text of the active value, or undefined when unset. */
  value?: string;
  onClear: () => void;
  /** Popover width and the like (default `w-60`). */
  contentClassName?: string;
  /** Popover body. Receives `close` to dismiss after picking. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className={cn(chip, active && 'border-primary/60')}>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label} filter`}
            className="text-primary hover:text-foreground"
          >
            <XCircleIcon className="size-3.5" />
          </button>
        ) : (
          <PlusCircleIcon className="size-3.5 text-muted-foreground" />
        )}
        <PopoverTrigger className="inline-flex min-w-0 items-center gap-1.5 outline-none">
          {label}
          {active ? (
            <>
              <span className="h-3 w-px bg-foreground/25" aria-hidden />
              <span className="truncate font-medium text-primary">{value}</span>
            </>
          ) : null}
        </PopoverTrigger>
      </span>
      <PopoverContent
        align="start"
        className={cn('w-60 p-1.5', contentClassName)}
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/** A filter chip with a fixed list of options. */
export function OptionFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T | undefined) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <FilterChip
      label={label}
      value={current?.label}
      onClear={() => onChange(undefined)}
    >
      {(close) => (
        <ul className="flex flex-col">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value === value ? undefined : option.value);
                  close();
                }}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
              >
                <CheckIcon
                  className={cn(
                    'size-3.5',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </FilterChip>
  );
}

/**
 * A filter chip for long option lists (operations, jobs): a search field over a
 * scrollable list. `value` is the selected option's value.
 */
export function SearchableOptionFilter({
  label,
  value,
  options,
  onChange,
  emptyText = 'No match.',
}: {
  label: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
  emptyText?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <FilterChip
      label={label}
      value={value === undefined ? undefined : (current?.label ?? value)}
      onClear={() => onChange(undefined)}
      contentClassName="w-80"
    >
      {(close) => (
        <OptionSearchList
          options={options}
          selected={value}
          emptyText={emptyText}
          onPick={(next) => {
            onChange(next === value ? undefined : next);
            close();
          }}
        />
      )}
    </FilterChip>
  );
}

function OptionSearchList({
  options,
  selected,
  emptyText,
  onPick,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string | undefined;
  emptyText: string;
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        placeholder="Search..."
        aria-label="Search options"
        className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {visible.map((option) => (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => onPick(option.value)}
              title={option.label}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
            >
              <CheckIcon
                className={cn(
                  'size-3.5 shrink-0',
                  option.value === selected ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="truncate font-mono text-[13px]">
                {option.label}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="px-2 py-3 text-center text-sm text-muted-foreground">
            {emptyText}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** A filter chip whose popover holds a single text/number input. */
export function InputFilter({
  label,
  value,
  format = (v) => v,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string | undefined;
  format?: (value: string) => string;
  placeholder?: string;
  inputMode?: 'numeric' | 'text';
  onChange: (value: string | undefined) => void;
}) {
  return (
    <FilterChip
      label={label}
      value={value === undefined ? undefined : format(value)}
      onClear={() => onChange(undefined)}
    >
      {(close) => (
        <form
          className="p-1"
          onSubmit={(event) => {
            event.preventDefault();
            const raw = new FormData(event.currentTarget).get('value');
            const next = typeof raw === 'string' ? raw.trim() : '';
            onChange(next || undefined);
            close();
          }}
        >
          <input
            name="value"
            defaultValue={value ?? ''}
            autoFocus
            inputMode={inputMode}
            placeholder={placeholder}
            aria-label={label}
            className="h-8 w-full rounded-md border bg-background px-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <p className="mt-1.5 px-0.5 text-xs text-muted-foreground">
            Press Enter to apply.
          </p>
        </form>
      )}
    </FilterChip>
  );
}

/**
 * A text input that commits its value after the user pauses typing, so each
 * keystroke doesn't trigger a navigation and a fetch. Remount it with a `key`
 * to reset it when the committed value changes from elsewhere.
 */
export function DebouncedInput({
  value,
  onCommit,
  placeholder = 'Search...',
  delayMs = 400,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
  className?: string;
  'aria-label': string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onCommit(draft), delayMs);
    return () => clearTimeout(timer);
  }, [draft, value, delayMs, onCommit]);

  return (
    <SearchBox
      value={draft}
      onChange={setDraft}
      onEnter={() => onCommit(draft)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

/** The bordered search field on the right of a filter bar. */
export function SearchBox({
  value,
  onChange,
  onEnter,
  placeholder = 'Search...',
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  'aria-label': string;
}) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        className="h-9 w-full rounded-md border bg-card/60 pr-3 pl-10 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </div>
  );
}
