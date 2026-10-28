import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Page layout primitives: <Page><PageHeader><PageTitle /><PageActions /></PageHeader><PageSection /></Page>. */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-4 p-4 md:p-6', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      {children}
    </header>
  );
}

export function PageTitle({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {eyebrow ? (
        <div className="text-xs text-muted-foreground">{eyebrow}</div>
      ) : null}
      <h1 className="truncate text-lg font-semibold tracking-tight">
        {children}
      </h1>
    </div>
  );
}

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
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
    <section className={cn('flex min-w-0 flex-col gap-2', className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-sm font-medium text-muted-foreground">
              {title}
            </h2>
          ) : null}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
