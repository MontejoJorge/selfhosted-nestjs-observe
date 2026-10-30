import { TIME_RANGE_INFO, type TimeWindow } from './api/scope';

/** A custom window (`from`, maybe `to`) rather than a relative preset. */
export function isCustomWindow(window: TimeWindow): boolean {
  return window.from !== undefined;
}

/** A window with a fixed end: it doesn't slide, so there is nothing to auto-refresh. */
export function isFixedWindow(window: TimeWindow): boolean {
  return window.from !== undefined && window.to !== undefined;
}

/** Start and end of the window in epoch ms (presets end now). */
export function windowBounds(
  window: TimeWindow,
  now = Date.now(),
): { from: number; to: number } {
  if (window.from !== undefined) {
    return {
      from: Date.parse(window.from),
      to: window.to !== undefined ? Date.parse(window.to) : now,
    };
  }
  return { from: now - TIME_RANGE_INFO[window.range].ms, to: now };
}

export function windowMs(window: TimeWindow, now = Date.now()): number {
  const { from, to } = windowBounds(window, now);
  return to - from;
}

const dayTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Oct 28 06:30" in local time. */
const dayTime = (iso: string) =>
  dayTimeFormat.format(new Date(iso)).replace(',', '');
const day = (iso: string) => dayFormat.format(new Date(iso));
const sameDay = (a: string, b: string) =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** "Last 24 hours", or "Oct 28 06:30 → Oct 30 12:00" for a custom window. */
export function windowLabel(window: TimeWindow): string {
  if (window.from === undefined) return TIME_RANGE_INFO[window.range].label;
  return `${dayTime(window.from)} → ${window.to ? dayTime(window.to) : 'now'}`;
}

/**
 * The window inside a sentence: "last 24 hours", "Oct 28 → Oct 30", or
 * "Oct 30 06:30 → 12:00" for a custom window within one day.
 */
export function windowPhrase(window: TimeWindow): string {
  if (window.from === undefined) {
    return TIME_RANGE_INFO[window.range].label.toLowerCase();
  }
  if (window.to === undefined) return `since ${dayTime(window.from)}`;
  if (sameDay(window.from, window.to)) {
    return `${dayTime(window.from)} → ${timeFormat.format(new Date(window.to))}`;
  }
  return `${day(window.from)} → ${day(window.to)}`;
}
