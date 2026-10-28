import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { CircleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Label + control + optional hint: <Field label="Name" htmlFor="name"><Input id="name" /></Field>. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label
        htmlFor={htmlFor}
        className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The API error of a failed mutation, shown inside a form. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
      {errorMessage(error)}
    </p>
  );
}
