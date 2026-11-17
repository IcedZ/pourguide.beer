/** Helpers shared by the page template and the browser script. */
import type { BreweryData, Hours, Item } from './types';
import { formatDayKey, formatRange, itemDayKey } from './time';

export interface DayGroup {
  day: string;
  label: string;
  items: Item[];
}

export function groupByDay(items: Item[]): DayGroup[] {
  const map = new Map<string, Item[]>();
  for (const it of items) {
    const d = itemDayKey(it);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(it);
  }
  return [...map.entries()].map(([day, items]) => ({ day, label: formatDayKey(day), items }));
}

export function itemTime(it: Item): string {
  return it.allDay ? '' : formatRange(it.start, it.end);
}

/** "15:00" → "3 PM" */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

/** Status line for a brewery at a given ET weekday and minutes-since-midnight. */
export function openStatus(hours: Hours | undefined, dow: number, minutes: number): { open: boolean; text: string } | null {
  if (!hours) return null;
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  // Still open from last night (closing after midnight)?
  const prev = hours[(dow + 6) % 7];
  if (prev) {
    const [o, c] = prev.map(toMin);
    if (c < o && minutes < c) return { open: true, text: `Open until ${clock(prev[1])}` };
  }
  const today = hours[dow];
  if (!today) return { open: false, text: 'Closed today' };
  const [o, c] = today.map(toMin);
  const close = c <= o ? c + 1440 : c;
  if (minutes < o) return { open: false, text: `Opens at ${clock(today[0])}` };
  if (minutes < close) return { open: true, text: `Open until ${clock(today[1])}` };
  return { open: false, text: 'Closed for the night' };
}

export function beersOnly(b: BreweryData) {
  return b.taps.filter((t) => !t.notBeer);
}
export function otherPours(b: BreweryData) {
  return b.taps.filter((t) => t.notBeer);
}
