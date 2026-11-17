declare const __GUIDE_TZ__: string | undefined;
/** The location's time zone (loc/<id>/location.json), set at build time by astro.config.mjs. */
export const TZ: string = typeof __GUIDE_TZ__ !== 'undefined' ? __GUIDE_TZ__ : 'America/New_York';

const keyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD for an instant, in local time. */
export function dayKey(d: Date | string | number): string {
  return keyFmt.format(new Date(d));
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

/** Offset (minutes) of local time from UTC at a given instant. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUTC - at.getTime()) / 60000);
}

/**
 * Interpret a wall-clock time ("2026-11-07 15:00:00" or "2026-11-07T15:00")
 * as local time and return the UTC instant.
 */
export function fromLocal(wall: string): Date {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(wall);
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s || 0));
  const off = tzOffsetMinutes(guess);
  const first = new Date(guess.getTime() - off * 60000);
  // Re-check across DST boundaries.
  const off2 = tzOffsetMinutes(first);
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000);
}

/** Start-of-day instant (local time) for a YYYY-MM-DD key. */
export function startOfDay(key: string): Date {
  return fromLocal(`${key}T00:00`);
}

export function itemDayKey(item: { start: string; allDay: boolean }): string {
  return item.allDay ? item.start.slice(0, 10) : dayKey(item.start);
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

/** "3 PM", "7:30 PM" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(':00', '');
}

export function formatRange(start: string, end?: string): string {
  const a = formatTime(start);
  if (!end) return a;
  const b = formatTime(end);
  if (a === b) return a;
  // "4–9 PM" when both share a meridiem.
  const am = a.slice(-2), bm = b.slice(-2);
  if (am === bm) return `${a.slice(0, -3)}–${b}`;
  return `${a}–${b}`;
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** "Sat, Nov 7" for a YYYY-MM-DD key. */
export function formatDayKey(key: string): string {
  return dayFmt.format(new Date(`${key}T12:00:00Z`));
}

const stampFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** "Fri 3:10 PM" */
export function formatStamp(iso: string): string {
  return stampFmt.format(new Date(iso));
}
