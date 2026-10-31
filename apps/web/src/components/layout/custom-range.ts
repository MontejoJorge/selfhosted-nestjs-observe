import { MAX_WINDOW_DAYS, MAX_WINDOW_MS } from '@/lib/api/scope';
import { addDays, format, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

/** What the custom range popover edits: calendar days plus local start/end times. */
export interface RangeDraft {
  days: DateRange | undefined;
  /** `HH:mm`, local time. */
  startTime: string;
  endTime: string;
}

export const DEFAULT_START_TIME = '00:00';
export const DEFAULT_END_TIME = '23:59';

/** The draft for the applied window, or an empty one. */
export function draftOf(
  from: string | undefined,
  to: string | undefined,
): RangeDraft {
  if (from === undefined) {
    return {
      days: undefined,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    };
  }
  const start = new Date(from);
  const end = to === undefined ? new Date() : new Date(to);
  return {
    days: { from: startOfDay(start), to: startOfDay(end) },
    startTime: format(start, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
  };
}

/** `day` at the `HH:mm` local time. */
function at(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const date = new Date(day);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export type DraftResult =
  | { status: 'incomplete' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; from: Date; to: Date };

/**
 * The window a draft stands for. A single picked day spans that day; an end
 * after now is cut to now (there is no data yet).
 */
export function resolveDraft(draft: RangeDraft, now = new Date()): DraftResult {
  const { days, startTime, endTime } = draft;
  if (!days?.from || !startTime || !endTime) return { status: 'incomplete' };
  const from = at(days.from, startTime);
  const end = at(days.to ?? days.from, endTime);
  const to = end > now ? now : end;
  if (from >= now) {
    return { status: 'invalid', message: "The start can't be in the future." };
  }
  if (from >= to) {
    return { status: 'invalid', message: 'The end must be after the start.' };
  }
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return {
      status: 'invalid',
      message: `A custom range can be at most ${MAX_WINDOW_DAYS} days long.`,
    };
  }
  return { status: 'valid', from, to };
}

/** UTC `YYYY-MM-DD` of an instant, as the data-days endpoint returns. */
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Whether the local calendar `day` overlaps a UTC day with telemetry (a local
 * day can straddle two UTC days).
 */
export function dayHasData(day: Date, utcDays: ReadonlySet<string>): boolean {
  const start = startOfDay(day);
  const last = new Date(addDays(start, 1).getTime() - 1);
  return utcDays.has(utcDay(start)) || utcDays.has(utcDay(last));
}
