import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** One row of filter controls above a list. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** An active filter that can be cleared, e.g. `operation: GET /orders`. */
export function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-7 max-w-80 items-center gap-1 rounded-md border bg-muted/50 pr-1 pl-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-mono">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Clear ${label} filter`}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

const ANY = '__any__';

/** A select whose "any" option maps to `undefined`. */
export function OptionFilter<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T | undefined) => void;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ANY}
      onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}
    >
      <SelectTrigger
        size="sm"
        className={cn('w-36', className)}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  placeholder,
  delayMs = 400,
  className,
  icon = true,
  inputMode,
  'aria-label': ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
  className?: string;
  icon?: boolean;
  inputMode?: 'numeric' | 'text';
  'aria-label': string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onCommit(draft), delayMs);
    return () => clearTimeout(timer);
  }, [draft, value, delayMs, onCommit]);

  return (
    <div className={cn('relative', className)}>
      {icon ? (
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      ) : null}
      <Input
        value={draft}
        inputMode={inputMode}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit(draft);
        }}
        className={cn('h-7 text-xs', icon && 'pl-7')}
      />
    </div>
  );
}
