import { cn } from '@/lib/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** Copies `value` to the clipboard; the icon flips to a check for a moment. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // Rows are stretched links: don't navigate when copying.
        event.preventDefault();
        event.stopPropagation();
        navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => toast.error('Could not copy to the clipboard'),
        );
      }}
      className={cn(
        'relative z-10 inline-grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground',
        className,
      )}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-teal" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

/** A truncated id in a grey chip with a copy button, like trace ids in tables. */
export function IdChip({
  value,
  length = 10,
  className,
}: {
  value: string;
  length?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1 rounded-md border bg-secondary pr-0.5 pl-2 font-mono text-xs',
        className,
      )}
      title={value}
    >
      <span className="truncate">
        {value.length > length ? `${value.slice(0, length)}…` : value}
      </span>
      <CopyButton value={value} label="Copy id" />
    </span>
  );
}
