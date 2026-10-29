const integerFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const preciseTimeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
});
const relativeFormat = new Intl.RelativeTimeFormat('en-US', {
  numeric: 'auto',
});

export function formatCount(value: number): string {
  return value >= 10_000
    ? compactFormat.format(value)
    : integerFormat.format(value);
}

/** Formats a 0..1 ratio as a percentage. */
export function formatRate(ratio: number): string {
  if (ratio === 0) return '0%';
  const percent = ratio * 100;
  if (percent < 0.1) return '<0.1%';
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

/**
 * A 0..1 share as a whole percent without the sign: "<1" for a non-zero share that
 * would round to 0, and "99" rather than a rounded-up 100.
 */
export function formatShare(share: number): string {
  const value = Math.round(share * 100);
  if (value === 0 && share > 0) return '<1';
  if (value === 100 && share < 1) return '99';
  return String(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return `${value.toFixed(1)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '–';
  if (ms === 0) return '0 ms';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

/** Formats a value already expressed in megabytes (the agent reports memory in MB). */
export function formatMegabytes(mb: number | null | undefined): string {
  if (mb === null || mb === undefined) return '–';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatPreciseTime(iso: string): string {
  return preciseTimeFormat.format(new Date(iso));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(seconds, 'second');
  if (abs < 3600)
    return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400)
    return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  return relativeFormat.format(Math.round(seconds / 86_400), 'day');
}

export function shortId(id: string, length = 8): string {
  return id.length > length ? id.slice(0, length) : id;
}
