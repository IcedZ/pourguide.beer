import type { Beer, Brewery, Item, SourceResult } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { expandIcs, googleIcsUrl, type IcsOccurrence } from '@guide/lib/parsers/ics';
import { parseSqsCollection, parseSqsMenu, parseSqsMonthItems } from '@guide/lib/parsers/squarespace';
import { cheerio, decodeEntities, htmlToLines, parseAbv, stripHtml, tidyCase } from '@guide/lib/parsers/html';
import { extractUntappdHtml, parseUntappdMenu, untappdEmbedUrl } from '@guide/lib/parsers/untappd';
import { eventsCalendarUrl, expandEventsCalendar, type EcEvent } from '@guide/lib/parsers/eventscalendar';
import { colorFor, isNonAlcoholic, isNotBeer } from '@guide/lib/srm';
import { addDays, dayKey, fromLocal } from '@guide/lib/time';
import { beer, fromIcs, inWindow, monthsInWindow, PRIVATE, splitTrucks, type BreweryDef } from '@guide/lib/kit';

// =============================================================== breweries

const firstMagnitude: BreweryDef = {
  id: 'first-magnitude',
  name: 'First Magnitude Brewing Co.',
  shortName: 'First Magnitude',
  area: 'Depot Park',
  address: '1220 SE Veitch St, Gainesville',
  mapsUrl: 'https://maps.google.com/?q=First+Magnitude+Brewing+Company+Gainesville',
  website: 'https://www.fmbrewing.com/',
  tapsUrl: 'https://www.fmbrewing.com/on-tap',
  calendarUrl: 'https://www.fmbrewing.com/events',
  instagram: 'https://www.instagram.com/fmbrewing/',
  hours: { 0: ['12:00', '20:00'], 1: null, 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['14:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText('https://www.fmbrewing.com/on-tap', { fixture: 'fmb-on-tap.html', respectRobots: true });
        const menu = parseSqsMenu(html);
        // The "Beer To-Go" tab is cans and bottles; it's listed apart from the taps.
        const isToGo = (m: { menu: string }) => /to[\s-]?go|package/i.test(m.menu);
        const toGo = menu.filter(isToGo).map((m) => {
          const [name, ...rest] = m.title.split(/\s+-\s+/);
          return { name: tidyCase(name), style: rest.join(' - ') || m.description || undefined, size: m.section || undefined };
        });
        const taps = menu.filter((m) => !isToGo(m)).map((m) => {
          const [name, ...rest] = m.title.split(/\s+-\s+/);
          const style = rest.join(' - ') || (/(wine|non-alcoholic)/i.test(m.menu) ? undefined : m.section);
          return beer({
            name,
            style,
            abv: m.abv,
            description: m.description,
            category: m.menu && !/^beer$/i.test(m.menu) ? tidyCase(m.menu) : m.section ? tidyCase(m.section) : undefined,
            notBeer: /wine|non-alcoholic/i.test(m.menu) || /cider|mead/i.test(m.section || '') ? true : undefined,
          });
        });
        return { taps, toGo };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson('https://www.fmbrewing.com/event-calendar?format=json', { fixture: 'fmb-events.json' });
        const items: Item[] = parseSqsCollection(json, 'https://www.fmbrewing.com').map((e) => ({
          kind: 'event',
          title: e.title,
          start: new Date(e.startDate).toISOString(),
          end: new Date(e.endDate).toISOString(),
          allDay: false,
          url: e.fullUrl,
          description: e.excerpt,
        }));
        return { items: inWindow(items, ctx) };
      },
    },
    {
      name: 'Food trucks',
      async run(ctx) {
        // The food-truck collection page is hidden; its items are served to the
        // summary block on /food-trucks through this endpoint.
        const COLLECTION = '69daa0f739010f3c093dc05a';
        const items: Item[] = [];
        for (const month of monthsInWindow(ctx)) {
          const json = await fetchJson(
            `https://www.fmbrewing.com/api/open/GetItemsByMonth?month=${month}&collectionId=${COLLECTION}`,
            { fixture: `fmb-trucks-${month}.json` },
          );
          for (const e of parseSqsMonthItems(json, 'https://www.fmbrewing.com')) {
            for (const truck of splitTrucks(e.title)) {
              items.push({
                kind: 'food',
                title: truck,
                start: new Date(e.startDate).toISOString(),
                end: new Date(e.endDate).toISOString(),
                allDay: false,
                url: 'https://www.fmbrewing.com/food-trucks',
              });
            }
          }
        }
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const cypressGrove: BreweryDef = {
  id: 'cypress-grove',
  name: 'Cypress & Grove Brewing Co.',
  shortName: 'Cypress & Grove',
  area: 'NW 4th St',
  address: '1001 NW 4th St, Gainesville',
  mapsUrl: 'https://maps.google.com/?q=Cypress+%26+Grove+Brewing+Gainesville',
  website: 'https://www.cypressandgrove.com/',
  tapsUrl: 'https://www.cypressandgrove.com/beer',
  calendarUrl: 'https://www.cypressandgrove.com/calendar',
  instagram: 'https://www.instagram.com/cypressandgrovebrewing/',
  hours: { 0: ['14:00', '20:00'], 1: ['14:00', '22:00'], 2: ['14:00', '22:00'], 3: ['14:00', '22:00'], 4: ['14:00', '22:00'], 5: ['14:00', '22:00'], 6: ['14:00', '22:00'] },
  sources: [
    {
      name: 'Calendar',
      async run(ctx) {
        const ics = await fetchText(googleIcsUrl('eventsatcandg@gmail.com'), { fixture: 'cg.ics' });
        const items: Item[] = [];
        for (const o of expandIcs(ics, ctx.windowStart, ctx.windowEnd)) {
          if (PRIVATE.test(o.title)) continue;
          const food = o.title.match(/^\s*food\s*truck\s*:\s*(.+)$/i);
          if (food) {
            items.push(fromIcs(o, 'food', tidyCase(food[1])));
            continue;
          }
          const music = o.title.match(/^\s*live\s*music\s*:\s*(.+)$/i);
          if (music) {
            items.push(fromIcs(o, 'event', `Live music: ${music[1].trim()}`));
            continue;
          }
          items.push(fromIcs(o, 'event', o.title.replace(/^\s*event\s*:\s*/i, '')));
        }
        return { items };
      },
    },
    {
      name: 'Beer list',
      async run() {
        // C&G's site lists its four core beers; rotating taps aren't published online.
        const html = await fetchText('https://www.cypressandgrove.com/beer', { fixture: 'cg-beer.html', respectRobots: true });
        const $ = cheerio.load(html);
        const taps: Beer[] = [];
        $('h4').each((_, h) => {
          const withBreaks = $(h).clone();
          withBreaks.find('br').replaceWith('|');
          const raw = withBreaks.text().replace(/\s+/g, ' ').trim();
          let name: string, style: string | undefined;
          if (raw.includes('|')) {
            [name, style] = raw.split('|').map((s) => s.trim());
          } else {
            const m = raw.match(/^(.+?)\s+((?:West Coast|Japanese|American|German|Belgian|English|Irish|Hazy|New England|Double|Imperial|Session|Pale|Blonde|Golden|Amber|Brown|Red|Wheat|IPA|Lager|Pilsner|Stout|Porter|Sour|Saison|K[öo]lsch|Hefeweizen|Gose)\b.*)$/i);
            name = m ? m[1] : raw;
            style = m ? m[2] : undefined;
          }
          // ABV appears in the text that follows the heading.
          let abv: number | undefined;
          let node = $(h).next();
          for (let i = 0; i < 6 && node.length && abv === undefined; i++) {
            const t = node.text();
            if (/ABV/i.test(t)) abv = parseAbv(t.slice(t.search(/ABV/i)));
            node = node.next();
          }
          if (name && abv !== undefined) taps.push(beer({ name, style, abv }));
        });
        return { taps, tapsNote: 'Core lineup. Seasonal and rotating taps are posted on their Instagram.' };
      },
    },
  ],
};

const daftCow: BreweryDef = {
  id: 'daft-cow',
  name: 'Daft Cow Brewery',
  shortName: 'Daft Cow',
  area: 'Alachua',
  address: '13800 Tech City Cir, Ste 100, Alachua',
  mapsUrl: 'https://maps.google.com/?q=Daft+Cow+Brewery+Alachua',
  website: 'https://daftcowbrewery.com/',
  tapsUrl: 'https://daftcowbrewery.com/beer',
  calendarUrl: 'https://daftcowbrewery.com/food-truck-calendar',
  instagram: 'https://www.instagram.com/daftcowbrewery/',
  hoursNote: 'See daftcowbrewery.com for hours',
  sources: [
    {
      name: 'Calendar',
      async run(ctx) {
        // Same Google Calendar that feeds the EventsCalendar.co widget on their site.
        const ics = await fetchText(googleIcsUrl('c_a36mj76t0jsoom52h1r21b2n8c@group.calendar.google.com'), { fixture: 'dc.ics' });
        const items: Item[] = [];
        for (const o of expandIcs(ics, ctx.windowStart, ctx.windowEnd)) {
          if (PRIVATE.test(o.title)) continue;
          const t = o.title.trim();
          const isFood =
            /food\s*truck|food express|rolling dough|\beats\b|\bkitchen\b|\bbbq\b|tacos?\b|pizza(?! and beer)|lobsta|barbeskew|knockers|mananero|cheffrey|zamora/i.test(t) &&
            !/live music|trivia|bingo|open mic|mah\s*jongg|comedy|deal|\$\d/i.test(t);
          if (isFood) {
            items.push(fromIcs(o, 'food', tidyCase(t.replace(/\s*food(\s*truck)?\s*$/i, '').replace(/^the best\s+/i, ''))));
          } else {
            items.push(fromIcs(o, 'event', t));
          }
        }
        return { items };
      },
    },
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText('https://daftcowbrewery.com/beer', { fixture: 'dc-beer.html', respectRobots: true });
        return { taps: parseDaftCowTaps(htmlToLines(html)) };
      },
    },
  ],
};

/** Daft Cow's /beer page is plain text: "Name - Style - 5.5% ABV" lines, each followed by a description. */
export function parseDaftCowTaps(lines: string[]): Beer[] {
  const isBeerLine = (l: string) => /\d(?:\.\d)?\s*%/.test(l) && l.includes('-') && l.length < 90;
  const isHeader = (l: string) =>
    !/[,.!]/.test(l) && /^[A-Z]/.test(l) && l.split(' ').length <= 4 && !isBeerLine(l);
  const stop = /grab a can|weekly beer deal|copyright/i;
  const taps: Beer[] = [];
  let category: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (stop.test(l)) break;
    if (isBeerLine(l)) {
      const parts = l.replace(/\s*ABV\s*$/i, '').split(/\s+[-–]\s+/).map((s) => s.trim());
      const abvPart = parts.findIndex((p) => /%/.test(p));
      const abv = parseAbv(l);
      // The ABV may be its own segment or tacked onto the style ("Pale Ale 5.6% ABV").
      if (abvPart >= 0) parts[abvPart] = parts[abvPart].replace(/\d+(?:\.\d+)?\s*%.*$/, '').trim();
      const segs = parts.map((p) => p.replace(/\s*[-–]\s*$/, '')).filter(Boolean);
      const name = segs[0];
      // "Cherry Bomb IPA - 6.8% ABV" has no separate style; the name carries it and drives the color.
      const style = segs.length > 1 ? segs.slice(1).join(' ') : undefined;
      const desc: string[] = [];
      while (i + 1 < lines.length && !isBeerLine(lines[i + 1]) && !stop.test(lines[i + 1])) {
        const nxt = lines[i + 1];
        if (isHeader(nxt) && (i + 2 >= lines.length || isBeerLine(lines[i + 2]))) break;
        desc.push(nxt);
        i++;
      }
      taps.push(beer({ name, style, abv, category, description: desc.join(' ') || undefined }));
    } else if (isHeader(l) && i + 1 < lines.length && isBeerLine(lines[i + 1])) {
      category = l;
    }
  }
  return taps;
}

const swampHead: BreweryDef = {
  id: 'swamp-head',
  name: 'Swamp Head Brewery',
  shortName: 'Swamp Head',
  area: 'SW 42nd Ave',
  address: '3650 SW 42nd Ave, Gainesville',
  mapsUrl: 'https://maps.google.com/?q=Swamp+Head+Brewery+Gainesville',
  website: 'https://swamphead.com/',
  tapsUrl: 'https://swamphead.com/tasting-room/#ontap',
  calendarUrl: 'https://swamphead.com/tasting-room/#events',
  instagram: 'https://www.instagram.com/swamphead/',
  hours: { 0: ['12:00', '20:00'], 1: ['15:00', '22:00'], 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Events & food trucks',
      async run(ctx) {
        // WordPress "The Events Calendar" REST API. Food trucks are a category.
        const from = dayKey(ctx.windowStart);
        const to = dayKey(ctx.windowEnd);
        const json = await fetchJson(
          `https://swamphead.com/wp-json/tribe/events/v1/events?start_date=${from}%2000:00:00&end_date=${to}%2023:59:59&per_page=50`,
          { fixture: 'sh-events.json' },
        );
        const items: Item[] = (json.events ?? []).map((e: any) => {
          const isFood = (e.categories ?? []).some((c: any) => /food/i.test(c.name || c.slug));
          const start = e.utc_start_date ? new Date(e.utc_start_date.replace(' ', 'T') + 'Z') : fromLocal(e.start_date);
          const end = e.utc_end_date ? new Date(e.utc_end_date.replace(' ', 'T') + 'Z') : fromLocal(e.end_date);
          const title = decodeEntities(e.title || '');
          return {
            kind: isFood ? 'food' : 'event',
            title,
            start: e.all_day ? e.start_date.slice(0, 10) : start.toISOString(),
            end: e.all_day ? undefined : end.toISOString(),
            allDay: !!e.all_day,
            url: e.url,
            description: e.description ? stripHtml(e.description).slice(0, 280) || undefined : undefined,
          } satisfies Item;
        });
        // A truck entry like "Mayflower & Taino Roots" is two trucks here — Swamp Head lists one entry per day.
        const split = items.flatMap((it) =>
          it.kind === 'food' ? splitPair(it.title).map((t) => ({ ...it, title: tidyCase(t) })) : [it],
        );
        return { items: inWindow(split, ctx) };
      },
    },
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText('https://swamphead.com/tasting-room/', { fixture: 'sh-tasting-room.html', respectRobots: true });
        return { taps: parseSwampHeadTaps(html) };
      },
    },
  ],
};

/**
 * Elementor markup: each beer is an h2 (name) followed by an h3 ("STYLE | 5.0%"),
 * with the description in the next container. Old lists are kept on the page inside
 * a `.hideme` container, so those are dropped. An h2 not followed by an h3 is a category.
 */
export function parseSwampHeadTaps(html: string): Beer[] {
  const $ = cheerio.load(html);
  $('.hideme').remove();
  const heads = $('h2, h3').toArray();
  const startIdx = heads.findIndex((h) => /on tap/i.test($(h).text()));
  const endIdx = heads.findIndex((h, i) => i > startIdx && /^food trucks?$/i.test($(h).text().trim()));
  const slice = heads.slice(startIdx + 1, endIdx > 0 ? endIdx : undefined);
  const taps: Beer[] = [];
  let category: string | undefined;
  for (let i = 0; i < slice.length; i++) {
    const h = slice[i];
    const text = $(h).text().replace(/\s+/g, ' ').trim();
    if (h.tagName === 'h2') {
      const nxt = slice[i + 1];
      const nxtText = nxt ? $(nxt).text() : '';
      if (nxt && nxt.tagName === 'h3' && /\|\s*[\d.]+\s*%/.test(nxtText)) {
        const [style] = nxtText.split('|');
        const container = $(nxt).closest('.e-con');
        const description = container.next('.e-con').find('.elementor-widget-text-editor').first().text().replace(/\s+/g, ' ').trim();
        const desc = description ? tidyCase(description).replace(/^./, (c) => c.toUpperCase()) : undefined;
        taps.push(
          beer({
            name: text,
            style: style.trim(),
            abv: parseAbv(nxtText),
            description: desc ? sentenceCase(desc) : undefined,
            category,
            notBeer: /wine/i.test(category || '') ? true : undefined,
          }),
        );
        i++;
      } else {
        category = tidyCase(text);
      }
    }
  }
  return taps;
}

/** "Mayflower & Taino Roots" → two trucks, but leave names like "Good Life Eats & Treats" whole. */
function splitPair(title: string): string[] {
  if (/eats\s*&\s*treats|rock\s*&\s*roll|mac\s*&\s*cheese|fish\s*&\s*chips/i.test(title)) return [title];
  return title.split(/\s+(?:&|\+|and)\s+/).filter(Boolean);
}

function sentenceCase(s: string): string {
  // Swamp Head writes descriptions in caps; after tidyCase they're Title Case, so drop to sentence case.
  if (s.split(' ').filter((w) => /^[A-Z][a-z]/.test(w)).length / s.split(' ').length > 0.6) {
    const lower = s.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1).replace(/\b(ipa|neipa|wcipa|pb&j|ne)\b/gi, (m) => m.toUpperCase());
  }
  return s;
}

const blackadder: BreweryDef = {
  id: 'blackadder',
  name: 'Blackadder Brewing Company',
  shortName: 'Blackadder',
  area: 'NW 60th St',
  address: '618 NW 60th St, Suite A, Gainesville',
  mapsUrl: 'https://maps.google.com/?q=Blackadder+Brewing+Company+Gainesville',
  website: 'https://www.blackadderbrewing.com/',
  tapsUrl: 'https://www.blackadderbrewing.com/taplist',
  calendarUrl: 'https://www.blackadderbrewing.com/events',
  instagram: 'https://www.instagram.com/blackadderbrewing/',
  hours: { 0: ['12:00', '18:00'], 1: null, 2: ['16:00', '21:00'], 3: ['16:00', '21:00'], 4: ['16:00', '21:00'], 5: ['16:00', '21:00'], 6: ['12:00', '21:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Untappd for Business menu embedded on /taplist (location 4682, theme 15006).
        const js = await fetchText(untappdEmbedUrl(4682, 15006), { fixture: 'ba-untappd.js' });
        const items = parseUntappdMenu(extractUntappdHtml(js));
        const house = items.filter((i) => /blackadder/i.test(i.section ?? ''));
        const guests = items.filter((i) => !/blackadder/i.test(i.section ?? ''));
        const naGuests = guests.filter((i) => isNonAlcoholic(i));
        const otherGuests = guests.length - naGuests.length;
        const taps = [
          ...house.map((i) => beer({ name: i.name, style: i.style, abv: i.abv, description: i.description })),
          // Listed under "Also pouring" normally, and in full under the non-alcoholic filter.
          ...naGuests.map((i) => beer({ name: i.name, style: i.style, abv: i.abv, description: i.description, category: 'Guest', notBeer: true })),
        ];
        return {
          taps,
          tapsNote: otherGuests ? `Plus ${otherGuests} other guest beers, ciders and wines.` : undefined,
        };
      },
    },
    {
      name: 'Calendar',
      async run(ctx) {
        // EventsCalendar.co widget on /events. Native events (not Google), "Food Truck: …" prefix for trucks.
        const json = await fetchJson<{ value?: EcEvent[] }>(
          eventsCalendarUrl('proj_1yRXW3wNytzgQcjPgRxF5', 'user_Ggdb3kiEKrOMxzonXv2r6'),
          { fixture: 'ba-events.json' },
        );
        const from = dayKey(ctx.windowStart);
        const to = addDays(dayKey(ctx.windowEnd), 1);
        const items: Item[] = [];
        for (const o of expandEventsCalendar(json.value ?? [], from, to)) {
          if (PRIVATE.test(o.title)) continue;
          const food = o.title.match(/^\s*food\s*truck\s*:\s*(.+)$/i);
          items.push({
            kind: food ? 'food' : 'event',
            title: food ? tidyCase(food[1]) : o.title,
            start: o.start,
            end: o.end,
            allDay: o.allDay,
            url: o.url,
            description: o.description,
          });
        }
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const grandScheme: BreweryDef = {
  id: 'grand-scheme',
  name: 'Grand Scheme Brewing',
  shortName: 'Grand Scheme',
  area: 'South Main Station',
  address: '619 S Main St, Unit 1B, Gainesville',
  mapsUrl: 'https://maps.google.com/?q=Grand+Scheme+Brewing+Gainesville',
  website: 'https://www.grandschemebrewing.com/',
  tapsUrl: 'https://www.instagram.com/grandschemebrewing.ontap',
  instagram: 'https://www.instagram.com/grandschemebrewing',
  hours: { 0: ['11:00', '22:00'], 1: ['16:00', '22:00'], 2: ['16:00', '22:00'], 3: ['16:00', '22:00'], 4: ['16:00', '22:00'], 5: ['11:00', '22:00'], 6: ['11:00', '22:00'] },
  // No machine-readable sources: the tap list is an image and there's no public calendar.
  // Fill in loc/gnv/manual.yaml, or ask them to publish a calendar/tap list feed.
  sources: [
    {
      name: 'Tap list',
      async run() {
        return { tapsNote: 'Grand Scheme posts its tap list as an image on Instagram.' };
      },
    },
  ],
};

const highSprings: BreweryDef = {
  id: 'high-springs',
  name: 'High Springs Brewing Company',
  shortName: 'High Springs',
  area: 'High Springs',
  address: '18562 NW 237th St, High Springs',
  mapsUrl: 'https://maps.google.com/?q=High+Springs+Brewing+Company',
  website: 'https://highspringsbrewing.com/',
  tapsUrl: 'https://highspringsbrewing.com/liquid/',
  calendarUrl: 'https://highspringsbrewing.com/events/',
  instagram: 'https://www.instagram.com/hsbrewing/',
  hours: { 0: ['13:00', '20:00'], 1: null, 2: ['15:00', '21:00'], 3: ['15:00', '21:00'], 4: ['15:00', '21:00'], 5: ['14:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // The /liquid/ page renders from this Google Apps Script JSON endpoint.
        const rows: any[] = await fetchJson(
          'https://script.google.com/macros/s/AKfycby2Ohmx7x9rdQlAtAZBJYnEHf7EjxMnntCYnMULRpzQeOYtYheHuLiWdYSmD5pn_z5m/exec',
          { fixture: 'hs-taps.json' },
        );
        const onTap = rows.filter((r) => /on tap|almost out/i.test(r.status || ''));
        const soon = rows.filter((r) => /coming soon/i.test(r.status || ''));
        const taps = onTap.map((r) => {
          // Guest taps come through as "GUEST: Beers" / style "Oktoberfest".
          const guest = /^guest\s*:/i.test(String(r.name));
          return beer({
            name: guest ? String(r.style) : String(r.name),
            style: guest ? 'Guest tap' : r.style,
            abv: typeof r.abv === 'number' ? r.abv : parseAbv(String(r.abv)),
            description: r.desc || undefined,
            color: /^#[0-9a-f]{6}$/i.test(r.srmHex || '') ? r.srmHex : undefined,
            category: /almost out/i.test(r.status) ? 'Almost out' : undefined,
            notBeer: Number(r.abv) === 0 || /cider/i.test(`${r.style} ${r.name}`) ? true : undefined,
          });
        });
        return {
          taps,
          tapsNote: soon.length ? `Coming soon: ${soon.map((r) => String(r.name)).join(', ')}.` : undefined,
        };
      },
    },
    {
      name: 'Calendar',
      async run(ctx) {
        const ics = await fetchText(googleIcsUrl('c5ig3netd2sc96fo1fvstfdmno@group.calendar.google.com'), { fixture: 'hs.ics' });
        const items: Item[] = [];
        for (const o of expandIcs(ics, ctx.windowStart, ctx.windowEnd)) {
          if (PRIVATE.test(o.title)) continue;
          // High Springs puts food trucks in as all-day entries and bands as timed ones.
          const notFood = /\bvs\.?\b|game|closed|holiday|market|festival|release|anniversary/i.test(o.title);
          if (o.allDay && !notFood) items.push(fromIcs(o, 'food', tidyCase(o.title)));
          else items.push(fromIcs(o, 'event', o.title.replace(/\s*time tbd\s*$/i, ' (time TBD)')));
        }
        return { items };
      },
    },
  ],
};

export const BREWERIES: BreweryDef[] = [firstMagnitude, swampHead, cypressGrove, blackadder, grandScheme, daftCow, highSprings];
