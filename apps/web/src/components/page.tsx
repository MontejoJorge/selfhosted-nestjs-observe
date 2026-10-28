import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Page layout primitives: <Page><PageHeader><PageTitle /><ScopeControls /></PageHeader>…</Page>. */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-6 px-4 pt-2 pb-16 md:px-8 lg:px-[60px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      {children}
    </header>
  );
}

/** Big bold title with a monospace subtitle; `eyebrow` holds a breadcrumb on detail pages. */
export function PageTitle({
  children,
  subtitle,
  eyebrow,
  avatar,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  /** A square mark left of the title (the project monogram). */
  avatar?: ReactNode;
}) {
  const title = (
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow ? (
        <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="flex min-w-0 items-center gap-2.5 text-[28px] leading-tight font-bold tracking-tight">
        {children}
      </h1>
      {subtitle ? (
        <p className="max-w-[48ch] font-mono text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
  if (!avatar) return title;
  return (
    <div className="flex min-w-0 items-start gap-4">
      <div className="mt-1 shrink-0">{avatar}</div>
      {title}
    </div>
  );
}

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function PageSection({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-[15px] font-semibold">{title}</h2>
          ) : null}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A responsive two-column grid of panels. */
export function PanelGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 gap-6 xl:grid-cols-2', className)}>
      {children}
    </div>
  );
}
