import ICAL from 'ical.js';
import { dayKey } from '../time';

export interface IcsOccurrence {
  title: string;
  description?: string;
  location?: string;
  url?: string;
  allDay: boolean;
  /** ISO instant, or YYYY-MM-DD for all-day. */
  start: string;
  end?: string;
}

/**
 * Parse an iCalendar feed and expand recurring events into the given window.
 * Handles VTIMEZONE, RRULE, EXDATE and moved/cancelled instances (RECURRENCE-ID).
 */
export function expandIcs(text: string, windowStart: Date, windowEnd: Date): IcsOccurrence[] {
  const root = new ICAL.Component(ICAL.parse(text));

  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(tz);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }

  // Group by UID so exceptions attach to their master event.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }

  const out: IcsOccurrence[] = [];
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();

  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null) => {
    const status = String(ev.component.getFirstPropertyValue('status') || '').toUpperCase();
    if (status === 'CANCELLED') return;
    const allDay = start.isDate;
    const s = start.toJSDate();
    const e = end ? end.toJSDate() : s;
    // Overlaps the window?
    if (e.getTime() < ws || s.getTime() >= we) return;
    out.push({
      title: (ev.summary || '').trim(),
      description: ev.description?.trim() || undefined,
      location: ev.location?.trim() || undefined,
      url: (ev.component.getFirstPropertyValue('url') as string) || undefined,
      allDay,
      start: allDay ? isoDate(start) : s.toISOString(),
      end: allDay ? undefined : e.toISOString(),
    });
  };

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate);
      continue;
    }
    // Skip series that finished before the window, cheaply.
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let guard = 0;
    while ((next = it.next()) && guard++ < 20000) {
      const t = next.toJSDate().getTime();
      if (t >= we) break;
      if (t < ws - 2 * 86_400_000) continue;
      const occ = ev.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate);
    }
  }

  return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function isoDate(t: ICAL.Time): string {
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

function sortKey(o: IcsOccurrence): string {
  return o.allDay ? `${o.start}T00` : `${dayKey(o.start)}T${o.start}`;
}

/** Public iCal URL for a Google Calendar ID. */
export function googleIcsUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}
