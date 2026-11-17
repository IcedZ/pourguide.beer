import ICAL from 'ical.js';
import { fetchJson } from '../fetch';
import { addDays, fromLocal } from '../time';

/**
 * Update.Beer (update.beer) — a hosted tap list / events service. Its public client
 * library reads straight from this PocketBase API, so we do the same.
 * The business id is the 15-character id passed to `createMenuClient(...)` on the brewery's site.
 */
const API = 'https://pulley.pockethost.io/api/collections';

async function records(collection: string, filter: string, sort: string, fixture: string): Promise<any[]> {
  const params = new URLSearchParams({ filter, perPage: '200', page: '1' });
  if (sort) params.set('sort', sort);
  const json = await fetchJson<{ items?: any[] }>(`${API}/${collection}/records?${params}`, { fixture });
  return json.items ?? [];
}

const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export interface UbTap {
  name: string;
  style?: string;
  abv?: number;
  description?: string;
  category?: string;
  brewery?: string;
  beverageType?: string;
}

export async function fetchUbTaps(business: string, fixture: string): Promise<UbTap[]> {
  const rows = await records(
    'taplist_items',
    `business=${q(business)} && status="on_tap" && display_lists ~ "taplist"`,
    'tap_number,display_order',
    fixture,
  );
  return rows.map((r) => ({
    name: String(r.name ?? '').trim(),
    style: r.style || undefined,
    abv: typeof r.abv === 'number' && r.abv > 0 ? r.abv : r.abv === 0 ? 0 : undefined,
    description: r.description || undefined,
    category: r.category || undefined,
    brewery: r.brewery || undefined,
    beverageType: r.beverage_type || undefined,
  })).filter((t) => t.name);
}

export interface UbOccurrence {
  title: string;
  category?: string;
  description?: string;
  allDay: boolean;
  /** ISO instant, or YYYY-MM-DD when allDay. */
  start: string;
  end?: string;
}

/** "1630" → "16:30". */
function hhmm(n: unknown): string | undefined {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return `${String(Math.floor(v / 100)).padStart(2, '0')}:${String(v % 100).padStart(2, '0')}`;
}

/** Events in [fromDay, toDay) (YYYY-MM-DD, local), with weekly/monthly repeats expanded. */
export async function fetchUbEvents(business: string, fromDay: string, toDay: string, fixtures: { events: string; exceptions: string }): Promise<UbOccurrence[]> {
  const [events, exceptions] = await Promise.all([
    records('events', `business=${q(business)} && status="active" && visibility="public"`, 'start_date', fixtures.events),
    records('event_exceptions', `business=${q(business)}`, '', fixtures.exceptions).catch(() => [] as any[]),
  ]);
  const exc = new Map<string, any>();
  for (const e of exceptions) exc.set(`${e.event}|${String(e.exception_date ?? '').slice(0, 10)}`, e);

  const out: UbOccurrence[] = [];
  for (const ev of events) {
    const first = String(ev.start_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) continue;
    const days: string[] = [];
    if (ev.rrule) {
      const rule = ICAL.Recur.fromString(String(ev.rrule));
      const it = rule.iterator(ICAL.Time.fromDateString(first));
      for (let t = it.next(), n = 0; t && n < 2000; t = it.next(), n++) {
        const d = t.toString().slice(0, 10);
        if (d >= toDay) break;
        if (d >= fromDay) days.push(d);
      }
    } else if (first >= fromDay && first < toDay) {
      days.push(first);
    }
    for (const d of days) {
      const x = exc.get(`${ev.id}|${d}`);
      if (x?.exception_type === 'cancelled') continue;
      const name = String(x?.name || ev.name || '').trim();
      if (!name) continue;
      const startT = hhmm(x?.start_time ?? ev.start_time);
      const endT = hhmm(x?.end_time ?? ev.end_time);
      const allDay = Boolean(ev.all_day) || !startT;
      let start: string, end: string | undefined;
      if (allDay) {
        start = d;
      } else {
        start = fromLocal(`${d}T${startT}`).toISOString();
        if (endT) {
          // An end time earlier than the start runs past midnight.
          end = fromLocal(`${endT < startT! ? addDays(d, 1) : d}T${endT}`).toISOString();
        }
      }
      out.push({ title: name, category: ev.category || undefined, description: x?.description || ev.description || undefined, allDay, start, end });
    }
  }
  return out;
}
