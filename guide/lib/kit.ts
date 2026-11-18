/**
 * Building blocks for loc/<id>/breweries.ts: the types every brewery definition uses,
 * and helpers shared by more than one location.
 */
import type { Beer, Brewery, Item, SourceResult } from './types';
import { fetchText } from './fetch';
import type { IcsOccurrence } from './parsers/ics';
import { decodeEntities, stripHtml, tidyCase } from './parsers/html';
import { extractUntappdHtml, parseUntappdMenu, untappdEmbedUrl, type UntappdItem } from './parsers/untappd';
import { colorFor, isNotBeer } from './srm';
import { dayKey, fromLocal } from './time';

export interface Ctx {
  windowStart: Date;
  windowEnd: Date;
}

export interface Source {
  /** Shown on the site if it fails, e.g. "Tap list". */
  name: string;
  run: (ctx: Ctx) => Promise<SourceResult>;
}

export interface BreweryDef extends Brewery {
  sources: Source[];
}

// ------------------------------------------------------------------ helpers

export function beer(b: Omit<Beer, 'color' | 'notBeer'> & { color?: string; notBeer?: boolean }): Beer {
  const name = tidyCase(b.name);
  const style = b.style ? tidyCase(b.style) : undefined;
  return {
    ...b,
    name,
    style,
    notBeer: b.notBeer ?? isNotBeer(style, name),
    color: b.color ?? colorFor(style, name, b.description),
  };
}

/** Drop emoji and other pictographs some calendars sprinkle into titles. */
export function plain(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fromIcs(o: IcsOccurrence, kind: Item['kind'], title = o.title): Item {
  return {
    kind,
    title: plain(title),
    start: o.start,
    end: o.end,
    allDay: o.allDay,
    description: o.description ? stripHtml(o.description).slice(0, 280) : undefined,
    url: o.url,
  };
}

export const PRIVATE = /\b(private|reserved|rental|available for|closed for|tables? reserved|birthday)\b/i;

/** A source for breweries that don't publish a tap list anywhere we can read. */
export function noteOnly(name: string, tapsNote: string): Source {
  return {
    name,
    async run() {
      return { tapsNote };
    },
  };
}

export interface UntappdOpts {
  /** Sections that are draft beer (default: every section not matched by `skip`). */
  draft?: RegExp;
  /** Sections to leave out entirely (food, merch…), and counted in no note. */
  ignore?: RegExp;
  /** Sections that aren't on tap (bottles, cans, wine…): counted in the note, not listed. */
  packaged?: RegExp;
  /** Sections whose items aren't beer (cider, kombucha, soda…). */
  notBeer?: RegExp;
  /** Brewery name for "house" beers; everything else is tagged "Guest". */
  house?: RegExp;
}

/** Tap list from an Untappd for Business embedded menu. */
export async function untappdTaps(location: number, theme: number, fixture: string, o: UntappdOpts = {}): Promise<SourceResult> {
  const js = await fetchText(untappdEmbedUrl(location, theme), { fixture });
  const items = parseUntappdMenu(extractUntappdHtml(js));
  const sec = (i: UntappdItem) => i.section ?? '';
  const kept = items.filter((i) => !(o.ignore?.test(sec(i))));
  const packaged = o.packaged ? kept.filter((i) => o.packaged!.test(sec(i))) : [];
  const poured = kept.filter((i) => !packaged.includes(i) && (!o.draft || o.draft.test(sec(i)) || o.notBeer?.test(sec(i))));
  const taps = poured.map((i) => {
    const guest = o.house && i.brewery && !o.house.test(i.brewery);
    return beer({
      name: i.name,
      style: i.style,
      abv: i.abv,
      description: i.description,
      category: guest ? 'Guest' : undefined,
      notBeer: o.notBeer?.test(sec(i)) ? true : undefined,
    });
  });
  return {
    taps,
    tapsNote: packaged.length ? `Plus ${packaged.length} cans, bottles and other drinks to go or stay.` : undefined,
  };
}

/** "Cold IPA - 2nd Bay" → style "Cold IPA". */
export function styleBeforeDash(s?: string): string | undefined {
  if (!s) return undefined;
  const style = s.split(/\s+-\s+|-\s+/)[0].trim();
  return style || undefined;
}

export function splitTrucks(title: string): string[] {
  return title
    .split(/\s+\+\s+/)
    .map((t) => tidyCase(t.trim()))
    .filter(Boolean);
}

/** Squarespace month keys ("11-2026") that the window touches. */
export function monthsInWindow(ctx: Ctx): string[] {
  const keys = new Set<string>();
  for (let t = ctx.windowStart.getTime(); t <= ctx.windowEnd.getTime(); t += 86_400_000) {
    const k = dayKey(t);
    keys.add(`${Number(k.slice(5, 7))}-${k.slice(0, 4)}`);
  }
  return [...keys];
}


export function tribeItems(json: any): Item[] {
  return (json.events ?? []).flatMap((e: any): Item[] => {
    const title = plain(decodeEntities(e.title || ''));
    if (!title || PRIVATE.test(title)) return [];
    const isFood = (e.categories ?? []).some((c: any) => /food/i.test(c.name || c.slug)) || /food\s*truck/i.test(title);
    const start = e.utc_start_date ? new Date(e.utc_start_date.replace(' ', 'T') + 'Z') : fromLocal(e.start_date);
    const end = e.utc_end_date ? new Date(e.utc_end_date.replace(' ', 'T') + 'Z') : fromLocal(e.end_date);
    return [
      {
        kind: isFood ? 'food' : 'event',
        title: isFood ? tidyCase(title.replace(/^food\s*truck\s*[:\-–]\s*/i, '')) : title,
        start: e.all_day ? e.start_date.slice(0, 10) : start.toISOString(),
        end: e.all_day ? undefined : end.toISOString(),
        allDay: !!e.all_day,
        url: e.url,
        description: e.description ? stripHtml(e.description).slice(0, 280) || undefined : undefined,
      },
    ];
  });
}

export function inWindow(items: Item[], ctx: Ctx): Item[] {
  const ws = ctx.windowStart.getTime();
  const we = ctx.windowEnd.getTime();
  return items.filter((it) => {
    const s = it.allDay ? fromLocal(`${it.start}T00:00`).getTime() : Date.parse(it.start);
    const e = it.end ? Date.parse(it.end) : s;
    return e >= ws && s < we;
  });
}

/** "House Pilsner" → "Pilsner", "Float Away IPA" → "IPA". For lists that only give a name. */
export function styleFromName(name: string): string | undefined {
  const m = name.match(
    /\b(Hazy IPA|West Coast IPA|Double IPA|DIPA|IPA|Pilsner|Helles|Lager|Dunkel|Kolsch|Kölsch|Hefeweizen|Witbier|Wheat|Cream Ale|Pale Ale|Amber|Red Ale|Brown Ale|Porter|Stout|Sour|Gose|Saison|Tripel|Dubbel|Bock|Marzen|Märzen|Oktoberfest|ESB|Barleywine|Blonde|Root Beer|Cider|Seltzer)\b/i,
  );
  return m ? tidyCase(m[1]) : undefined;
}
