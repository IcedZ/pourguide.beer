import type { Beer, Brewery, Item, SourceResult } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { expandIcs, googleIcsUrl, type IcsOccurrence } from '@guide/lib/parsers/ics';
import { parseSqsMenu } from '@guide/lib/parsers/squarespace';
import { cheerio, decodeEntities, parseAbv, stripHtml, tidyCase } from '@guide/lib/parsers/html';
import { extractUntappdHtml, parseUntappdMenu, untappdEmbedUrl, type UntappdItem } from '@guide/lib/parsers/untappd';
import { fetchArryvedMenu, parseArryvedMenu } from '@guide/lib/parsers/arryved';
import { fetchUbEvents, fetchUbTaps } from '@guide/lib/parsers/updatebeer';
import { colorFor, isNonAlcoholic, isNotBeer } from '@guide/lib/srm';
import { addDays, dayKey, fromLocal } from '@guide/lib/time';
import {
  beer,
  fromIcs,
  inWindow,
  noteOnly,
  plain,
  PRIVATE,
  styleBeforeDash,
  tribeItems,
  untappdTaps,
  type BreweryDef,
  type Ctx,
} from '@guide/lib/kit';

// =============================================================== breweries
//
// Every brewery on the Jax Ale Trail (visitjacksonville.com/jax-ale-trail/breweries/),
// except Disco Witch Brewing in Yulee, which closed at the end of 2025.

const secondBay: BreweryDef = {
  id: '2nd-bay',
  name: '2nd Bay Brewing Co.',
  shortName: '2nd Bay',
  area: 'Fruit Cove',
  address: '108 Bartram Oaks Walk, Suite 101, Fruit Cove',
  mapsUrl: 'https://maps.google.com/?q=2nd+Bay+Brewing+Fruit+Cove+FL',
  website: 'https://www.2ndbaybrewing.com/',
  tapsUrl: 'https://www.2ndbaybrewing.com/menus',
  calendarUrl: 'https://www.2ndbaybrewing.com/events/',
  instagram: 'https://www.instagram.com/2ndbaybrewing/',
  hoursNote: 'See 2ndbaybrewing.com for hours',
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Arryved digital menu embedded on /menus.
        const items = parseArryvedMenu(await fetchArryvedMenu('730712', '2ndbay-arryved.json'));
        const taps = items
          .filter((i) => !/^flight/i.test(i.name))
          .map((i) => {
            const guest = i.brewery && !/2nd\s*bay/i.test(i.brewery);
            return beer({ name: i.name, style: styleBeforeDash(i.description), abv: i.abv, category: guest ? 'Guest' : undefined });
          });
        return { taps };
      },
    },
  ],
};

const aardwolf: BreweryDef = {
  id: 'aardwolf',
  name: 'Aardwolf Brewing Company',
  shortName: 'Aardwolf',
  area: 'San Marco',
  address: '1461 Hendricks Ave, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Aardwolf+Brewing+Company+Jacksonville',
  website: 'https://www.aardwolfbrewing.com/',
  tapsUrl: 'https://www.aardwolfbrewing.com/home',
  instagram: 'https://www.instagram.com/aardwolf_brew/',
  hours: { 0: ['12:00', '21:00'], 1: null, 2: ['15:00', '23:00'], 3: ['15:00', '23:00'], 4: ['15:00', '23:00'], 5: ['15:00', '00:00'], 6: ['12:00', '00:00'] },
  // The beer menu is a PDF linked from the home page; the events calendar widget on /events is broken.
  sources: [noteOnly('Tap list', 'Aardwolf posts its beer menu as a PDF on its home page.')],
};

const boldCity: BreweryDef = {
  id: 'bold-city',
  kitchen: { name: 'Mateo’s', menuUrl: 'https://boldcitybrewery.com/#foodmenus' },
  name: 'Bold City Brewery',
  shortName: 'Bold City',
  area: 'Rosselle St',
  address: '2670-7 Rosselle St, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Bold+City+Brewery+Rosselle+St+Jacksonville',
  website: 'https://boldcitybrewery.com/',
  tapsUrl: 'https://boldcitybrewery.com/',
  instagram: 'https://www.instagram.com/boldcitybrewery/',
  hours: { 0: ['12:00', '18:00'], 1: null, 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['12:00', '22:00'], 6: ['12:00', '22:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Untappd for Business menu on the home page.
        return untappdTaps(48594, 174308, 'bc-untappd.js');
      },
    },
  ],
};

const congaree: BreweryDef = {
  id: 'congaree',
  kitchen: { name: 'The Roost', menuUrl: 'https://www.congareeandpenn.com/reservations' },
  name: 'Congaree and Penn',
  shortName: 'Congaree & Penn',
  area: 'Northside farm',
  address: '11830 Old Kings Rd, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Congaree+and+Penn+Jacksonville',
  website: 'https://www.congareeandpenn.com/',
  calendarUrl: 'https://www.congareeandpenn.com/calendar',
  instagram: 'https://www.instagram.com/congareeandpenn/',
  hoursNote: 'Open Thursday to Sunday; see their calendar',
  sources: [noteOnly('Tap list', 'Congaree and Penn doesn’t post its drinks list online.')],
};

const engine15: BreweryDef = {
  id: 'engine-15',
  kitchen: { menuUrl: 'https://engine15.com/food' },
  name: 'Engine 15 Brewing Co.',
  shortName: 'Engine 15',
  area: 'Jax Beach',
  address: '1500 Beach Blvd, Suite 217, Jacksonville Beach',
  mapsUrl: 'https://maps.google.com/?q=Engine+15+Brewing+Jacksonville+Beach',
  website: 'https://engine15.com/',
  tapsUrl: 'https://engine15.com/',
  calendarUrl: 'https://engine15.com/',
  instagram: 'https://www.instagram.com/engine15/',
  hours: { 0: ['11:00', '22:00'], 1: ['16:30', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '23:00'], 5: ['11:00', '23:00'], 6: ['11:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Engine 15's site is built on Update.Beer (business p9qkoickvvnyeaq).
        const rows = await fetchUbTaps('p9qkoickvvnyeaq', 'e15-taps.json');
        const taps = rows.map((r) =>
          beer({
            name: r.name,
            style: r.style,
            abv: r.abv,
            description: r.description,
            category: r.brewery && !/engine\s*15/i.test(r.brewery) ? 'Guest' : undefined,
            notBeer: r.beverageType && !/beer/i.test(r.beverageType) ? true : undefined,
          }),
        );
        return { taps };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        const occ = await fetchUbEvents('p9qkoickvvnyeaq', dayKey(ctx.windowStart), dayKey(ctx.windowEnd), {
          events: 'e15-events.json',
          exceptions: 'e15-exceptions.json',
        });
        // Their "Weekly Specials" mix deals (happy hour, $5 Guinness Mondays…) with real nights
        // like Trivia, so leave out only the deals.
        const isDeal = (t: string) => /\$\s?\d|happy hour|liquid lunch|\bspecials?\b/i.test(t);
        const items: Item[] = occ.filter((o) => !isDeal(o.title)).map((o) => ({
          kind: /food\s*truck/i.test(`${o.title} ${o.category ?? ''}`) ? 'food' : 'event',
          title: o.title,
          start: o.start,
          end: o.end,
          allDay: o.allDay,
          description: o.description,
          url: 'https://engine15.com/',
        }));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const fishweir: BreweryDef = {
  id: 'fishweir',
  name: 'Fishweir Brewing Company',
  shortName: 'Fishweir',
  area: 'Murray Hill',
  address: '1183 Edgewood Ave S, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Fishweir+Brewing+Company+Jacksonville',
  website: 'https://fishweirbrewing.com/',
  tapsUrl: 'https://fishweirbrewing.com/menu/',
  calendarUrl: 'https://fishweirbrewing.com/events/',
  instagram: 'https://www.instagram.com/fishweirbrewing/',
  hours: { 0: ['12:00', '20:00'], 1: ['15:00', '21:00'], 2: ['15:00', '21:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText('https://fishweirbrewing.com/menu/', { fixture: 'fw-menu.html', respectRobots: true });
        return { taps: parseFishweirTaps(html) };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        const html = await fetchText('https://fishweirbrewing.com/events/', { fixture: 'fw-events.html', respectRobots: true });
        return { items: inWindow(parseFishweirEvents(html, ctx), ctx) };
      },
    },
  ],
};

/**
 * Elementor loop grid: section headings are h2s, each beer is an `.e-loop-item` with
 * the name, then the style, then "ABV 5.4%". The "$6 Beer of the Week" repeats in its
 * own section, and wine and packaged beer have sections of their own.
 */
function parseFishweirTaps(html: string): Beer[] {
  const $ = cheerio.load(html);
  const out: Beer[] = [];
  let section = '';
  $('h2.elementor-heading-title, .e-loop-item').each((_, el) => {
    if ($(el).is('h2')) {
      section = $(el).text().replace(/\s+/g, ' ').trim();
      return;
    }
    if (/wine|packaged|beer of the week/i.test(section)) return;
    const heads = $(el)
      .find('.elementor-heading-title')
      .map((_, h) => $(h).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    // The weekly special carries a "$6 BEER OF THE WEEK:" label above its name.
    if (/beer of the week/i.test(heads[0] ?? '')) heads.shift();
    const name = heads[0];
    if (!name) return;
    const abvText = $(el)
      .find('.elementor-icon-list-text')
      .map((_, t) => $(t).text())
      .get()
      .find((t) => /abv/i.test(t));
    const na = /n\/a|non-?alc/i.test(section);
    // The N/A section also lists sodas, juice boxes and coffee; keep the beer-like drinks.
    if (na && /\b(soda|juice|coffee|cold brew|poppi)\b/i.test(heads.join(' '))) return;
    const notBeer = na || /cider|seltzer/i.test(section) || /champagne|\bwine\b/i.test(heads[1] ?? '') ? true : undefined;
    // Ciders, seltzers and N/A drinks are listed as maker + flavor ("Congaree and Penn" / "Farm Cider").
    const flavorNamed = /cider|seltzer|n\/a/i.test(section) && heads[1];
    out.push(
      beer({
        name: flavorNamed ? `${name} ${heads[1]}` : name,
        style: flavorNamed ? undefined : heads[1],
        abv: abvText ? parseAbv(abvText) : na ? 0 : undefined,
        category: /cider|seltzer|n\/a/i.test(section) ? tidyCase(section.replace(/n\/a options/i, 'Non-alcoholic')) : undefined,
        notBeer,
      }),
    );
  });
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Tue 17 Nov" + "Trivia Night — 7:00 pm - 9:00 pm". */
function parseFishweirEvents(html: string, ctx: Ctx): Item[] {
  const $ = cheerio.load(html);
  const today = dayKey(ctx.windowStart);
  const out: Item[] = [];
  $('.event-row').each((_, row) => {
    const date = $(row).find('.event-date .elementor-heading-title').first().text().trim();
    const label = $(row)
      .find('.elementor-heading-title')
      .map((_, h) => $(h).text().replace(/\s+/g, ' ').trim())
      .get()
      .find((t) => t && t !== date);
    const dm = date.match(/(\d{1,2})\s+([a-z]{3})/i);
    if (!dm || !label) return;
    const month = MONTHS.indexOf(dm[2].toLowerCase());
    if (month < 0) return;
    // No year on the page: use this year, or next year for January dates seen in December.
    let year = Number(today.slice(0, 4));
    const key = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    if (key(year) < addDays(today, -60)) year += 1;
    const day = key(year);
    const [rawTitle, times = ''] = label.split(/\s+[—–]\s+/);
    const tm = [...times.matchAll(/(\d{1,2}):(\d{2})\s*([ap])m/gi)].map((m) => {
      let h = Number(m[1]) % 12;
      if (m[3].toLowerCase() === 'p') h += 12;
      return `${String(h).padStart(2, '0')}:${m[2]}`;
    });
    const title = rawTitle.trim();
    if (!title || PRIVATE.test(title)) return;
    out.push({
      kind: /food\s*truck/i.test(title) ? 'food' : 'event',
      title,
      start: tm[0] ? fromLocal(`${day}T${tm[0]}`).toISOString() : day,
      end: tm[1] ? fromLocal(`${tm[1] < tm[0] ? addDays(day, 1) : day}T${tm[1]}`).toISOString() : undefined,
      allDay: !tm[0],
      url: $(row).attr('href') || 'https://fishweirbrewing.com/events/',
    });
  });
  // The same market sometimes appears twice in a day with different hours; keep the first.
  const seen = new Set<string>();
  return out.filter((it) => {
    const k = `${it.title.toLowerCase()}|${it.start.slice(0, 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const flyingFish: BreweryDef = {
  id: 'flying-fish',
  kitchen: { menuUrl: 'https://flyingfishtaphouse.com/menu' },
  name: 'Flying Fish Taphouse',
  shortName: 'Flying Fish',
  area: 'Airport Rd',
  address: '1341 Airport Rd, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Flying+Fish+Taphouse+1341+Airport+Rd+Jacksonville',
  website: 'https://flyingfishtaphouse.com/',
  tapsUrl: 'https://flyingfishtaphouse.com/#brewery',
  hours: { 0: ['11:00', '21:00'], 1: ['11:00', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '22:00'], 5: ['11:00', '22:00'], 6: ['11:00', '22:00'] },
  sources: [
    {
      name: 'Beer list',
      async run() {
        // The home page lists three always-on house beers ("Puddle Jumper Lager — 4.2% ABV").
        const html = await fetchText('https://flyingfishtaphouse.com/', { fixture: 'ff-home.html', respectRobots: true });
        const $ = cheerio.load(html);
        const taps: Beer[] = [];
        $('.beer').each((_, el) => {
          const head = $(el).find('h3').first().text().replace(/\s+/g, ' ').trim();
          const m = head.match(/^(.+?)\s+[—–-]\s+(\d+(?:\.\d+)?)%\s*ABV/i);
          if (!m) return;
          const style = m[1].match(/\b(Lager|IPA|Pilsner|Pils|Stout|Porter|Ale|Wheat|Sour|Amber)\b/i)?.[1];
          taps.push(beer({ name: m[1], style, abv: Number(m[2]), description: $(el).find('p').first().text().trim() || undefined }));
        });
        const rotating = $('h3').map((_, h) => $(h).text()).get().find((t) => /rotating/i.test(t));
        return { taps, tapsNote: rotating ? `Plus ${tidyCase(rotating.replace(/\s+/g, ' ').trim()).toLowerCase()}, not listed online.` : undefined };
      },
    },
  ],
};

const graceNote: BreweryDef = {
  id: 'grace-note',
  name: 'Grace Note Brewing',
  shortName: 'Grace Note',
  area: 'Ortega',
  address: '4591 Lakeside Dr, Suite 108, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Grace+Note+Brewing+Jacksonville',
  website: 'https://www.gracenote.beer/',
  calendarUrl: 'https://www.gracenote.beer/',
  instagram: 'https://www.instagram.com/gracenotebrewing/',
  hoursNote: 'See gracenote.beer for hours',
  // Weekly nights are in loc/jax/manual.yaml; their tap list is only on Untappd.
  sources: [noteOnly('Tap list', 'Grace Note keeps its tap list on Untappd.')],
};

const greenRoom: BreweryDef = {
  id: 'green-room',
  name: 'Green Room Brewing',
  shortName: 'Green Room',
  area: 'Jax Beach',
  address: '228 3rd St N, Jacksonville Beach',
  mapsUrl: 'https://maps.google.com/?q=Green+Room+Brewing+Jacksonville+Beach',
  website: 'https://greenroombrewing.com/',
  instagram: 'https://www.instagram.com/greenroombrew/',
  hours: { 0: ['12:00', '22:00'], 1: null, 2: ['15:00', '00:00'], 3: ['15:00', '00:00'], 4: ['15:00', '00:00'], 5: ['15:00', '01:00'], 6: ['15:00', '01:00'] },
  sources: [noteOnly('Tap list', 'Green Room posts its taps on Instagram. Count Shakula Stout and Head High IPA are always on.')],
};

const inkFactory: BreweryDef = {
  id: 'ink-factory',
  name: 'Ink Factory Brewing',
  shortName: 'Ink Factory',
  area: 'Jax Beach',
  address: '602 Shetter Ave, Jacksonville Beach',
  mapsUrl: 'https://maps.google.com/?q=Ink+Factory+Brewing+Jacksonville+Beach',
  website: 'https://www.inkfactorybrewing.com/',
  tapsUrl: 'https://www.inkfactorybrewing.com/beer',
  instagram: 'https://www.instagram.com/inkfactorybrewing/',
  hours: { 0: ['08:00', '20:00'], 1: ['08:00', '20:00'], 2: ['08:00', '20:00'], 3: ['08:00', '22:00'], 4: ['08:00', '22:00'], 5: ['08:00', '22:00'], 6: ['08:00', '22:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        return untappdTaps(42987, 167470, 'ink-untappd.js');
      },
    },
  ],
};

const legacy: BreweryDef = {
  id: 'legacy',
  kitchen: { menuUrl: 'https://www.legacyaleworks.com/food' },
  name: 'Legacy Ale Works',
  shortName: 'Legacy',
  area: 'Bartram Park',
  address: '14965 Old St Augustine Rd, Suite 129, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Legacy+Ale+Works+Jacksonville',
  website: 'https://www.legacyaleworks.com/',
  tapsUrl: 'https://www.legacyaleworks.com/taps',
  calendarUrl: 'https://www.legacyaleworks.com/events',
  instagram: 'https://www.instagram.com/legacyale/',
  hours: { 0: ['11:00', '20:00'], 1: ['15:00', '20:00'], 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['11:00', '23:00'], 6: ['11:00', '23:00'] },
  // The tap list on /taps is a picture (iMenuPro), and events are on Facebook.
  sources: [noteOnly('Tap list', 'Legacy posts its tap list as an image on its website.')],
};

const mayport: BreweryDef = {
  id: 'mayport',
  name: 'Mayport Brewing Company',
  shortName: 'Mayport',
  area: 'Mayport',
  address: '2152 Mayport Rd, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Mayport+Brewing+Company+Jacksonville',
  website: 'https://mayportbrewing.com/',
  tapsUrl: 'https://mayportbrewing.com/on-tap/',
  calendarUrl: 'https://mayportbrewing.com/events/',
  instagram: 'https://www.instagram.com/mayportbrewing/',
  hours: { 0: ['12:00', '00:00'], 1: ['16:00', '00:00'], 2: ['16:00', '00:00'], 3: ['16:00', '00:00'], 4: ['16:00', '00:00'], 5: ['14:00', '02:00'], 6: ['12:00', '02:00'] },
  hoursNote: '21+ only',
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Untappd menu on /on-tap/: their own beers first, then guest drafts, then cans and bottles.
        return untappdTaps(45992, 171680, 'mp-untappd.js', {
          house: /mayport/i,
          packaged: /bottle|import|craft beers|seltzer|liquor|wine|n\/a beer/i,
          notBeer: /cider|kombucha/i,
        });
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        // WordPress "The Events Calendar".
        const from = dayKey(ctx.windowStart);
        const to = dayKey(ctx.windowEnd);
        const json = await fetchJson(
          `https://mayportbrewing.com/wp-json/tribe/events/v1/events?start_date=${from}%2000:00:00&end_date=${to}%2023:59:59&per_page=50`,
          { fixture: 'mp-events.json' },
        );
        return { items: inWindow(tribeItems(json), ctx) };
      },
    },
  ],
};

/** Items from The Events Calendar's REST API (categories named "food…" are food trucks). */
const myrtle: BreweryDef = {
  id: 'myrtle-avenue',
  name: 'Myrtle Avenue Brewing',
  shortName: 'Myrtle Avenue',
  area: 'Rail Yard District',
  address: '633 Myrtle Ave N, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Myrtle+Avenue+Brewing+Jacksonville',
  website: 'https://www.facebook.com/MyrtleAveBrewing/',
  hoursNote: 'Hours and events are on their Facebook page',
  sources: [noteOnly('Tap list', 'Myrtle Avenue posts its taps and events on Facebook only.')],
};

const reve: BreweryDef = {
  id: 'reve',
  kitchen: { menuUrl: 'https://www.revebrewing.com/menu' },
  name: 'Reve Brewing',
  shortName: 'Reve',
  area: 'Atlantic Beach',
  address: '1237 Mayport Rd, Atlantic Beach',
  mapsUrl: 'https://maps.google.com/?q=Reve+Brewing+Atlantic+Beach',
  website: 'https://www.revebrewing.com/',
  tapsUrl: 'https://www.revebrewing.com/taplist',
  instagram: 'https://www.instagram.com/revebrewing/',
  hours: { 0: ['12:00', '21:00'], 1: null, 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Update.Beer business 4xz1f6p27rt4rb9; the beer's category ("Hoppy Things") is kept.
        const rows = await fetchUbTaps('4xz1f6p27rt4rb9', 'reve-taps.json');
        const taps = rows.map((r) =>
          beer({
            name: r.name,
            style: r.style || undefined,
            abv: r.abv,
            description: r.description,
            // Reve groups its list as "Hoppy Things", "Sour Things"… Shown as the beer's group.
            category: r.brewery && !/reve/i.test(r.brewery) ? 'Guest' : r.category?.replace(/\s*\*.*$/, '') || undefined,
            notBeer: (r.beverageType && !/beer/i.test(r.beverageType)) || /seltzer|\bthc\b|kombucha|cider|wine/i.test(`${r.name} ${r.category ?? ''}`) ? true : undefined,
          }),
        );
        return { taps };
      },
    },
  ],
};

const rubyBeach: BreweryDef = {
  id: 'ruby-beach',
  name: 'Ruby Beach Brewing',
  shortName: 'Ruby Beach',
  area: 'Downtown',
  address: '228 E Forsyth St, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Ruby+Beach+Brewing+Jacksonville',
  website: 'https://www.rubybeachbrewing.com/',
  instagram: 'https://www.instagram.com/rubybeachbrewing/',
  hours: { 0: ['10:00', '22:00'], 1: ['14:00', '22:00'], 2: ['14:00', '22:00'], 3: ['14:00', '22:00'], 4: ['14:00', '22:00'], 5: ['11:00', '00:00'], 6: ['11:00', '00:00'] },
  sources: [noteOnly('Tap list', 'Ruby Beach keeps its tap list on Untappd.')],
};

const sj: BreweryDef = {
  id: 'sj',
  name: 'SJ Brewing Co.',
  shortName: 'SJ Brewing',
  area: 'Yulee',
  address: '463646 State Rd 200, Suite 13, Yulee',
  mapsUrl: 'https://maps.google.com/?q=SJ+Brewing+Yulee+FL',
  website: 'https://sjbrewingco.com/',
  instagram: 'https://www.instagram.com/sjbrewing/',
  hoursNote: 'Closed Mondays; check their socials for hours',
  // Their website wasn't answering when this guide was built. Weekly nights are in manual.yaml.
  sources: [noteOnly('Tap list', 'SJ Brewing keeps its tap list on Untappd.')],
};

const southernSwells: BreweryDef = {
  id: 'southern-swells',
  name: 'Southern Swells Brewing Company',
  shortName: 'Southern Swells',
  area: 'Jax Beach',
  address: '1312 Beach Blvd, Suite 3406, Jacksonville Beach',
  mapsUrl: 'https://maps.google.com/?q=Southern+Swells+Brewing+Jacksonville+Beach',
  website: 'https://www.southernswells.com/',
  tapsUrl: 'https://www.southernswells.com/beer',
  calendarUrl: 'https://www.southernswells.com/events-releases',
  instagram: 'https://www.instagram.com/southernswells/',
  hours: { 0: ['12:00', '20:00'], 1: ['14:00', '21:00'], 2: ['14:00', '21:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  hoursNote: 'Jax Beach taproom; there’s a second one at The Block Jax',
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Squarespace menu block: "ON DRAFT", then cocktails, cans, bottles and non-alcoholic.
        const html = await fetchText('https://www.southernswells.com/beer', { fixture: 'ss-beer.html', respectRobots: true });
        const items = parseSqsMenu(html);
        const draft = items.filter((i) => /on draft/i.test(i.section ?? ''));
        const packaged = items.length - draft.length;
        const taps = draft.map((i) => {
          // "NE IPA w/ Simcoe + Mosaic Cryo" → style "NE IPA", with the rest as the description.
          const [style, ...rest] = (i.description ?? '').split(/\s+w\/\s+/i);
          return beer({
            name: i.title,
            style: style || undefined,
            abv: i.abv,
            description: rest.length ? `With ${rest.join(' w/ ')}` : undefined,
          });
        });
        return { taps, tapsNote: packaged ? `Plus ${packaged} cans, bottles, cocktails and non-alcoholic drinks.` : undefined };
      },
    },
  ],
};

const STRINGS_SITE = 'https://stringssportsbrewery.com/';

const stringsBeach: BreweryDef = {
  id: 'strings-beach',
  kitchen: { name: 'Strings Street Fare', menuUrl: 'https://order.toasttab.com/online/strings-sports-brewery-beaches-1618-penman-road' },
  name: 'Strings Sports Brewery – Jax Beach',
  shortName: 'Strings (Jax Beach)',
  area: 'Jax Beach',
  address: '1618 Penman Rd, Jacksonville Beach',
  mapsUrl: 'https://maps.google.com/?q=Strings+Sports+Brewery+Jacksonville+Beach',
  website: STRINGS_SITE,
  calendarUrl: 'https://stringssportsbrewery.com/events/',
  instagram: 'https://www.instagram.com/stringssportsbrewery/',
  hoursNote: 'See stringssportsbrewery.com for hours',
  sources: [noteOnly('Tap list', 'Strings doesn’t post a tap list online.')],
};

const stringsSpringfield: BreweryDef = {
  id: 'strings-springfield',
  kitchen: { name: 'Strings Street Fare', menuUrl: 'https://order.toasttab.com/online/strings-sports-brewery-springfield-1850-north-main-street' },
  name: 'Strings Sports Brewery – Springfield',
  shortName: 'Strings (Springfield)',
  area: 'Springfield',
  address: '1850 N Main St, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Strings+Sports+Brewery+Springfield+Jacksonville',
  website: STRINGS_SITE,
  calendarUrl: 'https://stringssportsbrewery.com/events/',
  instagram: 'https://www.instagram.com/stringssportsbrewery/',
  hoursNote: 'See stringssportsbrewery.com for hours',
  sources: [noteOnly('Tap list', 'Strings doesn’t post a tap list online.')],
};

const tepeyolot: BreweryDef = {
  id: 'tepeyolot',
  kitchen: { menuUrl: 'https://tepeys.com/jacksonville-east-san-marco-tepeyolot-cerveceria-food-menu' },
  name: 'Tepeyolot Cerveceria',
  shortName: 'Tepeyolot',
  area: 'San Marco',
  address: '2130 Kings Ave, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Tepeyolot+Cerveceria+Jacksonville',
  website: 'https://tepeys.com/',
  tapsUrl: 'https://tepeys.com/jacksonville-east-san-marco-tepeyolot-cerveceria-menus',
  instagram: 'https://www.instagram.com/tepeyolotbeer',
  hours: { 0: ['11:00', '21:00'], 1: ['17:00', '21:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '22:00'], 5: ['11:00', '23:00'], 6: ['11:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Untappd menu on "Our Beers". It was switched off when this guide was built;
        // if it comes back, the beers show up here on their own.
        try {
          return await untappdTaps(37243, 144501, 'tep-untappd.js');
        } catch (err) {
          if (/HTTP 404|ENOENT/.test(String(err))) return { tapsNote: 'Tepeyolot’s online beer list is offline right now.' };
          throw err;
        }
      },
    },
  ],
};

const veterans: BreweryDef = {
  id: 'veterans-united',
  name: 'Veterans United Craft Brewery',
  shortName: 'Veterans United',
  area: 'Baymeadows',
  address: '8999 Western Way, Suite 104, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Veterans+United+Craft+Brewery+Jacksonville',
  website: 'https://vubrew.com/',
  tapsUrl: 'https://vubrew.com/',
  calendarUrl: 'https://vubrew.com/events',
  instagram: 'https://www.instagram.com/vubrew/',
  hours: { 0: ['12:00', '18:00'], 1: null, 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['12:00', '22:00'], 6: ['12:00', '22:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        return untappdTaps(24568, 93930, 'vu-untappd.js', {
          draft: /beers on tap/i,
          notBeer: /cider|non-alcoholic/i,
          ignore: /food|chips|dips|soda|water/i,
        });
      },
    },
    {
      name: 'Calendar',
      async run(ctx) {
        // Google Calendar embedded on /events. "FOOD TRUCK: …" entries are trucks.
        const ics = await fetchText(googleIcsUrl('eqj3st5n05f684o45okh695tus@group.calendar.google.com'), { fixture: 'vu.ics' });
        const items: Item[] = [];
        for (const o of expandIcs(ics, ctx.windowStart, ctx.windowEnd)) {
          const t = plain(o.title);
          // Mug Club happy hours are for members only.
          if (PRIVATE.test(t) || /daylight saving|^closed\b|\bclosed (for|on)\b|mug club/i.test(t)) continue;
          const food = t.match(/^\s*food\s*truck\s*:\s*(.+)$/i);
          if (food) {
            items.push(fromIcs(o, 'food', tidyCase(food[1])));
            continue;
          }
          const music = t.match(/^\s*musicians?\s*(?:\(no cover\))?\s*:\s*(.+)$/i);
          if (music) {
            items.push(fromIcs(o, 'event', `Live music: ${music[1].replace(/\s*live at vu.*$/i, '').trim()}`));
            continue;
          }
          items.push(fromIcs(o, 'event', t.replace(/^\s*taproom\s*:\s*/i, '')));
        }
        return { items };
      },
    },
  ],
};

const wickedBarley: BreweryDef = {
  id: 'wicked-barley',
  kitchen: { menuUrl: 'https://order.toasttab.com/menu-and-pay/wicked-barley-brewing-company/welcome' },
  name: 'Wicked Barley Brewing Company',
  shortName: 'Wicked Barley',
  area: 'Baymeadows',
  address: '4100 Baymeadows Rd, Jacksonville',
  mapsUrl: 'https://maps.google.com/?q=Wicked+Barley+Brewing+Jacksonville',
  website: 'https://wickedbarley.com/',
  tapsUrl: 'https://order.toasttab.com/menu-and-pay/wicked-barley-brewing-company/welcome',
  instagram: 'http://instagram.com/wickedbarleybrewing',
  hours: { 0: ['11:00', '21:00'], 1: ['11:00', '21:00'], 2: ['11:00', '21:00'], 3: ['11:00', '21:00'], 4: ['11:00', '21:00'], 5: ['11:00', '22:00'], 6: ['11:00', '22:00'] },
  sources: [noteOnly('Tap list', 'Wicked Barley’s tap list is part of its Toast online menu.')],
};

export const BREWERIES: BreweryDef[] = [
  aardwolf,
  boldCity,
  congaree,
  engine15,
  fishweir,
  flyingFish,
  graceNote,
  greenRoom,
  inkFactory,
  legacy,
  mayport,
  myrtle,
  reve,
  rubyBeach,
  secondBay,
  sj,
  southernSwells,
  stringsBeach,
  stringsSpringfield,
  tepeyolot,
  veterans,
  wickedBarley,
];
