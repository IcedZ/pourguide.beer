import { cheerio, decodeEntities } from './html';
import { addDays, dayKey, fromLocal } from '../time';
import type { Item } from '../types';

/**
 * SpotHopper websites (static.spotapps.co; "Powered by SpotHopper" in the footer).
 * Menus and events are in the page's HTML.
 */

export interface SpotMenuItem {
  /** The menu tab ("Draft List", "Beer", "Wine"…). */
  tab: string;
  /** The heading inside the tab, if any ("Guest Taps"). */
  section?: string;
  name: string;
  description?: string;
  price?: string;
}

/** Every item on a SpotHopper drink or food menu page, with its tab and section. */
export function parseSpotMenu(html: string): SpotMenuItem[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const tabs = new Map<string, string>();
  $('.food-menu-nav-item').each((_, a) => {
    const cls = ($(a).attr('class') ?? '').match(/menu_(\d+)_link/);
    const id = cls?.[1] ?? $(a).attr('href')?.replace(/\D/g, '');
    if (id) tabs.set(id, text(a));
  });
  const out: SpotMenuItem[] = [];
  $('.food-menu-grid').each((_, grid) => {
    const id = ($(grid).attr('class') ?? '').match(/menu_(\d+)/)?.[1] ?? '';
    const tab = tabs.get(id) ?? '';
    $(grid)
      .find('section')
      .each((_, sec) => {
        const heading = text($(sec).find('h2').first()) || undefined;
        $(sec)
          .find('.food-item-holder')
          .each((_, it) => {
            const name = text($(it).find('.food-item-title h3, .food-item-title').first());
            if (!name) return;
            out.push({
              tab,
              section: heading && heading !== 'Menu' ? heading : undefined,
              name,
              description: text($(it).find('.food-item-description').first()) || undefined,
              price: text($(it).find('.food-item-price, .food-price').first()) || undefined,
            });
          });
      });
  });
  return out;
}

/** SpotHopper fills every calendar with the same holiday notices ("Christmas", "Mardi Gras"…). */
const HOLIDAY =
  /^(thanksgiving|christmas( eve)?|new year'?s( eve| day)?|martin luther king( jr\.?)? day|mlk day|mardi gras|valentine'?s day|easter|st\.? patrick'?s day|mother'?s day|father'?s day|memorial day|labor day|independence day|4th of july|fourth of july|halloween|cinco de mayo|veterans day|presidents'? day)$/i;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NTH: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

export interface SpotEventOpts {
  /** Drop events whose title matches. */
  ignore?: RegExp;
  kind?: (title: string, description: string) => Item['kind'];
}

/**
 * Events from a SpotHopper events page, expanded into the window. Handles one-off events,
 * "Every <weekday>" and "Monthly on every <nth> <weekday>". Other repeat rules are skipped.
 */
export function parseSpotEvents(html: string, windowStart: Date, windowEnd: Date, o: SpotEventOpts = {}): Item[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const first = dayKey(windowStart);
  const last = dayKey(new Date(windowEnd.getTime() - 1));
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const out: Item[] = [];
  const seen = new Set<string>();

  $('.event-calendar-card').each((_, el) => {
    const c = $(el);
    const title = text(c.find('h2').first());
    if (!title || HOLIDAY.test(title) || o.ignore?.test(title)) return;
    const startDate = (c.attr('data-event-start-date') ?? '').slice(0, 10);
    const endDate = (c.attr('data-event-end-date') ?? '').slice(0, 10) || undefined;
    const startTime = c.attr('data-event-start-time') || undefined;
    const rule = c.attr('data-event-recurrence-type') ?? '';
    const ruleText = text(c.find('.event-info-text p').first()).toLowerCase();
    const description = c
      .find('.event-info-text p')
      .slice(rule === 'Does not Repeat' ? 0 : 1)
      .map((_, p) => text(p))
      .get()
      .filter(Boolean)
      .join(' ')
      .slice(0, 400);
    // "07:00 PM - 08:00 PM"
    const endClock = text(c.find('.event-time').first()).match(/-\s*(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;

    let dates: string[] = [];
    if (rule === 'Does not Repeat') {
      dates = [startDate];
    } else if (rule === 'Every') {
      const wd = new Date(`${startDate}T12:00:00Z`).getUTCDay();
      const named = WEEKDAYS.findIndex((w) => ruleText.includes(`every ${w}`));
      if (/every other/.test(ruleText)) {
        dates = days.filter((d) => {
          const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000);
          return diff >= 0 && diff % 14 === 0;
        });
      } else {
        const target = named >= 0 ? named : wd;
        dates = days.filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === target);
      }
    } else if (/^Monthly/i.test(rule)) {
      const m = ruleText.match(/every (first|second|third|fourth|last) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
      if (!m) return;
      const n = NTH[m[1]];
      const target = WEEKDAYS.indexOf(m[2]);
      dates = days.filter((d) => {
        const dt = new Date(`${d}T12:00:00Z`);
        if (dt.getUTCDay() !== target) return false;
        const dom = dt.getUTCDate();
        if (n > 0) return Math.ceil(dom / 7) === n;
        const next = new Date(dt.getTime() + 7 * 86400000);
        return next.getUTCMonth() !== dt.getUTCMonth();
      });
    } else {
      return;
    }
    dates = dates.filter((d) => d >= startDate && (!endDate || d <= endDate) && d >= first && d <= last);

    for (const d of dates) {
      const key = `${title}|${d}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = o.kind ? o.kind(title, description) : 'event';
      if (!startTime) {
        out.push({ kind, title, start: d, allDay: true, description: description || undefined });
        continue;
      }
      const start = fromLocal(`${d}T${startTime}`);
      let end: Date | undefined;
      if (endClock) {
        let h = Number(endClock[1]) % 12;
        if (/pm/i.test(endClock[3])) h += 12;
        const endDay = `${String(h).padStart(2, '0')}:${endClock[2]}` <= startTime ? addDays(d, 1) : d;
        end = fromLocal(`${endDay}T${String(h).padStart(2, '0')}:${endClock[2]}`);
      }
      out.push({ kind, title, start: start.toISOString(), end: end?.toISOString(), allDay: false, description: description || undefined });
    }
  });
  return out;
}
