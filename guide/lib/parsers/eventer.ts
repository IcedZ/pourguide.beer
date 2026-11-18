import { cheerio, decodeEntities } from './html';
import { addDays, fromLocal } from '../time';
import type { Item } from '../types';

/**
 * WordPress sites using the Eventer plugin: each event links to
 * `/eventer/<slug>/edate/YYYY-MM-DD` with a title and "Thursday, 7:00 pm to 10:00 pm".
 */
function clock(s: string): string | undefined {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function parseEventerList(html: string): Item[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const out: Item[] = [];
  const seen = new Set<string>();
  $('.eventer-event-item a[href*="/edate/"]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const date = href.match(/\/edate\/(\d{4}-\d{2}-\d{2})/)?.[1];
    const title = text($(a).find('.eventer-event-title').first());
    if (!date || !title || seen.has(href)) return;
    seen.add(href);
    const [from, to] = text($(a).find('.eventer-event-time').first()).split(/\s+to\s+/i);
    const s = from ? clock(from) : undefined;
    const e = to ? clock(to) : undefined;
    if (!s) {
      out.push({ kind: 'event', title, start: date, allDay: true, url: href });
      return;
    }
    const endDay = e && e <= s ? addDays(date, 1) : date;
    out.push({
      kind: 'event',
      title,
      start: fromLocal(`${date}T${s}`).toISOString(),
      end: e ? fromLocal(`${endDay}T${e}`).toISOString() : undefined,
      allDay: false,
      url: href,
    });
  });
  return out;
}
