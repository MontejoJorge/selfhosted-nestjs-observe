import { cn } from '@/lib/utils';

function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** A project's monogram on a crimson tile (we have no project images). */
export function ProjectAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl border border-primary/40 bg-linear-to-br from-primary/35 to-primary/5 font-mono text-sm font-bold text-foreground shadow-[0_0_20px_-6px_var(--primary)]',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
