import { cn } from '@/lib/utils';

export function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        'max-h-96 overflow-auto rounded-xl border bg-background/60 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre',
        className,
      )}
    >
      {children}
    </pre>
  );
}

export function JsonBlock({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  return (
    <CodeBlock className={className}>
      {JSON.stringify(value, null, 2)}
    </CodeBlock>
  );
}
