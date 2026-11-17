import { addDays, fromLocal } from '../time';

/**
 * Native events from an EventsCalendar.co (Inffuse) project — the calendar widget
 * many Wix and GoDaddy sites embed. Public feed:
 *   https://inffuse.eventscalendar.co/api/v0.1/projects/<proj_…>/data/public/events?user=<user_…>&app=calendar
 *
 * Times are wall-clock (startDate + startHour/startMinutes) in the calendar's
 * time zone, which for every brewery here is America/New_York.
 */
export interface EcEvent {
  title: string;
  startDate: string;
  endDate: string;
  startHour: number;
  startMinutes: number;
  endHour: number;
  endMinutes: number;
  allday?: boolean;
  description?: string;
  links?: { url: string }[];
  repeat?: {
    period: 'day' | 'week' | 'month' | string;
    value?: number;
    week?: { days?: number[] };
    until?: string;
    end?: { date?: string };
  };
}

export interface EcOccurrence {
  title: string;
  allDay: boolean;
  /** ISO instant, or YYYY-MM-DD for all-day. */
  start: string;
  end?: string;
  url?: string;
  description?: string;
}

export function eventsCalendarUrl(projectId: string, userId: string): string {
  return `https://inffuse.eventscalendar.co/api/v0.1/projects/${projectId}/data/public/events?user=${userId}&app=calendar`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Expand events (including simple weekly/daily/monthly repeats) into [fromDay, toDay). */
export function expandEventsCalendar(events: EcEvent[], fromDay: string, toDay: string): EcOccurrence[] {
  const out: EcOccurrence[] = [];

  const emit = (e: EcEvent, day: string) => {
    const url = e.links?.[0]?.url;
    const description = e.description?.trim() || undefined;
    if (e.allday) {
      out.push({ title: e.title.trim(), allDay: true, start: day, url, description });
      return;
    }
    const start = fromLocal(`${day}T${pad(e.startHour)}:${pad(e.startMinutes)}`);
    // Same-day events whose end time is earlier than the start run past midnight.
    const spanDays = Math.max(0, daysBetween(e.startDate, e.endDate));
    let endDay = addDays(day, spanDays);
    let end = fromLocal(`${endDay}T${pad(e.endHour)}:${pad(e.endMinutes)}`);
    if (end <= start) {
      endDay = addDays(endDay, 1);
      end = fromLocal(`${endDay}T${pad(e.endHour)}:${pad(e.endMinutes)}`);
    }
    out.push({ title: e.title.trim(), allDay: false, start: start.toISOString(), end: end.toISOString(), url, description });
  };

  for (const e of events) {
    if (!e?.title || !e.startDate) continue;
    const r = e.repeat;
    if (!r) {
      if (e.endDate >= fromDay && e.startDate < toDay) emit(e, e.startDate);
      continue;
    }
    const until = r.until || r.end?.date;
    const every = Math.max(1, Number(r.value) || 1);
    for (let day = fromDay; day < toDay; day = addDays(day, 1)) {
      if (day < e.startDate) continue;
      if (until && day > until) break;
      const offset = daysBetween(e.startDate, day);
      let hit = false;
      if (r.period === 'day') hit = offset % every === 0;
      else if (r.period === 'week') {
        const days = r.week?.days?.length ? r.week.days : [dow(e.startDate)];
        hit = days.includes(dow(day)) && Math.floor(offset / 7) % every === 0;
      } else if (r.period === 'month') {
        const months = (Number(day.slice(0, 4)) - Number(e.startDate.slice(0, 4))) * 12 + Number(day.slice(5, 7)) - Number(e.startDate.slice(5, 7));
        hit = day.slice(8) === e.startDate.slice(8) && months % every === 0;
      }
      if (hit) emit(e, day);
    }
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
