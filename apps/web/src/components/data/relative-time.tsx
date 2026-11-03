import { formatFullDateTime, formatRelative } from '@/lib/format';

/**
 * "5 minutes ago", with the exact date and time on hover. Raised above a `LinkRow`'s
 * stretched link, which would otherwise swallow the hover.
 */
export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={formatFullDateTime(iso)}
      className="relative z-10"
    >
      {formatRelative(iso)}
    </time>
  );
}
