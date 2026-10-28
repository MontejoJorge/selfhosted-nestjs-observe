import { cn } from '@/lib/utils';

/** Our neutral mark: a ring with an off-centre pupil, drawn in the accent color. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn('size-7 text-primary', className)}
    >
      <circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="19" cy="13" r="4.5" fill="currentColor" />
    </svg>
  );
}
