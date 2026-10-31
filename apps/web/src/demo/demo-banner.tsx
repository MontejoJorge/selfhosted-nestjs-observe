import { FlaskConical } from 'lucide-react';

/** Fixed notice that the dashboard is showing generated data. */
export function DemoBanner() {
  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
      <div className="bg-background/90 text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide uppercase shadow-sm backdrop-blur">
        <FlaskConical className="size-3.5" aria-hidden />
        Demo · generated data, no backend
      </div>
    </div>
  );
}
