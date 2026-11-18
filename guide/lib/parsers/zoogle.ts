import { cheerio, decodeEntities } from './html';
import { fromLocal } from '../time';

/**
 * Zoogle websites (images.zoogletools.com): a calendar block lists upcoming events as
 * `.event-detail` with a title link and "Wednesday, November 18 @ 8:00PM". The year
 * isn't shown, so it's the one that puts the date nearest after `near`.
 */
export interface ZoogleEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (24h), if the event has a time. */
  time?: string;
  endTime?: string;
  url?: string;
  notes?: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function clock(s?: string): string | undefined {
  const m = s?.match(/(\d{1,2})(?::(\d{2}))?\s*([AP]M)/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function parseZoogleEvents(html: string, near: Date): ZoogleEvent[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const out: ZoogleEvent[] = [];
  $('.event-detail').each((_, el) => {
    const a = $(el).find('.event-title a').first();
    const title = text(a.length ? a : $(el).find('.event-title').first());
    const when = $(el).find('.date-long').first();
    const dm = text(when.find('.date').first()).match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (!title || !dm) return;
    const mo = MONTHS.indexOf(dm[1].toLowerCase());
    if (mo < 0) return;
    // Pick the year that lands closest to (and not long before) `near`.
    let year = near.getUTCFullYear();
    const cand = (y: number) => Date.UTC(y, mo, Number(dm[2]));
    if (cand(year) < near.getTime() - 60 * 86400000) year += 1;
    const date = `${year}-${String(mo + 1).padStart(2, '0')}-${String(Number(dm[2])).padStart(2, '0')}`;
    const times = when.find('.time').map((_, t) => text(t)).get();
    out.push({
      title,
      date,
      time: clock(times[0]),
      endTime: clock(times[1]),
      url: a.attr('href') || undefined,
      notes: text($(el).find('.event-notes').first()).slice(0, 400) || undefined,
    });
  });
  return out;
}

/** ISO start/end for a Zoogle event, in the guide's time zone. */
export function zoogleTimes(e: ZoogleEvent): { start: string; end?: string; allDay: boolean } {
  if (!e.time) return { start: e.date, allDay: true };
  return {
    start: fromLocal(`${e.date}T${e.time}`).toISOString(),
    end: e.endTime ? fromLocal(`${e.date}T${e.endTime}`).toISOString() : undefined,
    allDay: false,
  };
}
