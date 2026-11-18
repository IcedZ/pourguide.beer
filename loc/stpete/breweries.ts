import type { Beer, Item } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { parseSqsCollection } from '@guide/lib/parsers/squarespace';
import { cheerio, decodeEntities } from '@guide/lib/parsers/html';
import { addDays, dayKey, fromLocal } from '@guide/lib/time';
import { beer, inWindow, noteOnly, PRIVATE, styleFromName, tribeItems, untappdTaps, type BreweryDef, type Ctx } from '@guide/lib/kit';

// The south region of Visit St. Pete/Clearwater's Gulp Coast beer trail (November 2026):
// St. Petersburg, Gulfport and the beaches. Webb's City Cellar (Green Bench's bottle shop)
// is mentioned in location.json instead.

const DEAL = /\$\s?\d|\d+\s?% off|happy hour|\bspecials?\b|mug club/i;
const CLOSED = /^(closed|open)\b|closed for/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "8:00pm" → "20:00". */
function clock(s?: string): string | undefined {
  const m = s?.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

/** The year that puts month/day nearest after the window start. */
function dateFor(mon: number, day: number, ctx: Ctx): string {
  let y = Number(dayKey(ctx.windowStart).slice(0, 4));
  if (Date.UTC(y, mon, day) < ctx.windowStart.getTime() - 60 * 86400000) y += 1;
  return `${y}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const grandCentral: BreweryDef = {
  id: 'grand-central',
  name: 'Grand Central Brewhouse',
  shortName: 'Grand Central',
  area: 'Grand Central District',
  address: '2340 Central Ave, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Grand+Central+Brewhouse+2340+Central+Ave+St+Petersburg',
  website: 'https://www.grandcentralbrew.com/',
  tapsUrl: 'https://www.grandcentralbrew.com/on-tap/',
  calendarUrl: 'https://www.grandcentralbrew.com/events/',
  instagram: 'https://www.instagram.com/grandcentralbrewhouse/',
  hours: { 0: ['11:00', '21:00'], 1: ['12:00', '22:00'], 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  kitchen: { name: 'LaLa St. Pete', menuUrl: 'https://www.grandcentralbrew.com/food/' },
  sources: [
    {
      name: 'Tap list',
      // "ON DECK" is what's coming next, not what's pouring.
      run: () =>
        untappdTaps(33425, 129229, 'gcb-untappd.js', {
          draft: /^(light side|hoppy|cider|sour|dark side)$/i,
          notBeer: /^cider$/i,
          packaged: /non-alcoholic|whites|ros[eé]|reds|sparkling|wine|^beer$|^lagers$|^ipas$/i,
          ignore: /on deck|slush|food|merch/i,
        }),
    },
  ],
};

const ratc: BreweryDef = {
  id: 'ratc',
  name: 'Right Around the Corner',
  shortName: 'Right Around the Corner',
  area: 'Grand Central District',
  address: '2244 Central Ave, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Right+Around+the+Corner+2244+Central+Ave+St+Petersburg',
  website: 'https://www.ratcstpete.com/',
  tapsUrl: 'https://www.ratcstpete.com/#tap-list',
  instagram: 'https://www.instagram.com/stpetearcadebar/',
  hours: { 0: ['12:00', '22:00'], 1: ['17:00', '22:00'], 2: ['17:00', '22:00'], 3: ['17:00', '23:00'], 4: ['17:00', '23:00'], 5: ['14:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [noteOnly('Tap list', 'Right Around the Corner’s tap list only loads in a browser, so it isn’t shown here.')],
};

const cage: BreweryDef = {
  id: 'cage',
  name: 'Cage Brewing',
  shortName: 'Cage',
  area: 'Grand Central District',
  address: '2001 1st Ave S, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Cage+Brewing+2001+1st+Ave+S+St+Petersburg',
  website: 'https://www.cagebrewing.com/',
  tapsUrl: 'https://www.cagebrewing.com/beer',
  calendarUrl: 'https://www.cagebrewing.com/music',
  instagram: 'https://www.instagram.com/cagebrewing/',
  hoursNote: 'Hours on their website',
  kitchen: { name: 'Kraken Joe’s', menuUrl: 'https://www.cagebrewing.com/menu' },
  sources: [noteOnly('Tap list', 'Cage’s beer menu only loads in a browser, so it isn’t shown here. Live music most nights.')],
};

const pinellasAleWorks: BreweryDef = {
  id: 'pinellas-ale-works',
  name: 'Pinellas Ale Works',
  shortName: 'Pinellas Ale Works',
  area: 'Warehouse Arts District',
  address: '1962 1st Ave S, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Pinellas+Ale+Works+1962+1st+Ave+S+St+Petersburg',
  website: 'https://www.pawbeer.com/',
  instagram: 'https://www.instagram.com/pinellasaleworks/',
  hours: { 0: ['12:00', '20:00'], 1: ['15:00', '22:00'], 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [noteOnly('Tap list', 'Pinellas Ale Works doesn’t post its tap list online.')],
};

const threeDaughters: BreweryDef = {
  id: '3-daughters',
  name: '3 Daughters Brewing',
  shortName: '3 Daughters',
  area: 'Warehouse Arts District',
  address: '222 22nd St S, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=3+Daughters+Brewing+222+22nd+St+S+St+Petersburg',
  website: 'https://3dbrewing.com/',
  calendarUrl: 'https://3dbrewing.com/events/',
  instagram: 'https://www.instagram.com/3daughtersbrewing/',
  hoursNote: 'Hours on their website',
  sources: [
    noteOnly('Tap list', '3 Daughters doesn’t post its tap list online.'),
    {
      name: 'Events',
      async run(ctx) {
        // One calendar for both tasting rooms: "Tasting Room" is St. Pete; Clearwater has its own category.
        const json = await fetchJson(
          `https://3dbrewing.com/wp-json/tribe/events/v1/events?per_page=50&start_date=${dayKey(ctx.windowStart)}`,
          { fixture: '3d-events.json' },
        );
        const events = (json.events ?? []).filter((e: any) => (e.categories ?? []).some((c: any) => /^tasting room$/i.test(c.name ?? '')));
        const items = tribeItems({ events }).filter((i) => !DEAL.test(i.title) && !CLOSED.test(i.title));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const bayboro: BreweryDef = {
  id: 'bayboro',
  name: 'Bayboro Brewing Co.',
  shortName: 'Bayboro',
  area: 'Warehouse Arts District',
  address: '2390 5th Ave S, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Bayboro+Brewing+2390+5th+Ave+S+St+Petersburg',
  website: 'https://bayborobrewing.com/',
  tapsUrl: 'https://bayborobrewing.com/beer-info.php',
  calendarUrl: 'https://bayborobrewing.com/upcoming-events.php',
  hoursNote: 'Hours on their website',
  sources: [
    noteOnly('Tap list', 'Bayboro doesn’t post a full tap list. Its regulars: Teufel Hunden German lager, Warehouse Wheat and Fifth Avenue IPA.'),
    {
      name: 'Events',
      async run(ctx) {
        // Event cards: a "Nov / 18" date badge, a title and "8:00pm – 10:00pm".
        const html = await fetchText('https://bayborobrewing.com/upcoming-events.php', { fixture: 'bay-events.html', respectRobots: true });
        const $ = cheerio.load(html);
        const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
        const items: Item[] = [];
        $('.event-card').each((_, el) => {
          const mon = MONTHS.indexOf(text($(el).find('.event-date-badge strong').first()).slice(0, 3).toLowerCase());
          const day = Number(text($(el).find('.event-date-badge span').first()));
          const title = text($(el).find('h3').first());
          if (mon < 0 || !day || !title || CLOSED.test(title) || /thanksgiving|christmas/i.test(title) || PRIVATE.test(title)) return;
          const date = dateFor(mon, day, ctx);
          const [from, to] = text($(el).find('.event-time').first()).split(/[–-]/);
          const s = clock(from);
          const e = clock(to);
          const url = $(el).find('a[href*="eventbrite"]').attr('href');
          if (!s) {
            items.push({ kind: 'event', title, start: date, allDay: true, url });
            return;
          }
          items.push({
            kind: 'event',
            title,
            start: fromLocal(`${date}T${s}`).toISOString(),
            end: e ? fromLocal(`${e <= s ? addDays(date, 1) : date}T${e}`).toISOString() : undefined,
            allDay: false,
            url,
          });
        });
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const stPeteBrewing: BreweryDef = {
  id: 'st-pete-brewing',
  name: 'St. Pete Brewing Co.',
  shortName: 'St. Pete Brewing',
  area: 'Downtown',
  address: '544 1st Ave N, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=St+Pete+Brewing+544+1st+Ave+N+St+Petersburg',
  website: 'https://www.stpetebrewingcompany.com/',
  tapsUrl: 'https://www.stpetebrewingcompany.com/on-tap/',
  calendarUrl: 'https://www.stpetebrewingcompany.com/events/',
  instagram: 'https://www.instagram.com/stpetebrewingco/',
  hours: { 0: ['12:00', '22:00'], 1: ['14:00', '22:00'], 2: ['14:00', '22:00'], 3: ['14:00', '00:00'], 4: ['14:00', '00:00'], 5: ['12:00', '01:00'], 6: ['12:00', '01:00'] },
  sources: [noteOnly('Tap list', 'St. Pete Brewing’s Untappd menu only loads in a browser, so it isn’t shown here.')],
};

const overflow: BreweryDef = {
  id: 'overflow',
  name: 'Overflow Brewing Company',
  shortName: 'Overflow',
  area: 'Edge District',
  address: '770 1st Ave N, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Overflow+Brewing+770+1st+Ave+N+St+Petersburg',
  website: 'https://www.visitstpeteclearwater.com/profile/overflow-brewing-company/138686',
  hoursNote: 'Check before you go',
  sources: [noteOnly('Tap list', 'Overflow doesn’t have a working website with its tap list.')],
};

const greenBench: BreweryDef = {
  id: 'green-bench',
  name: 'Green Bench Brewing Co.',
  shortName: 'Green Bench',
  area: 'Edge District',
  address: '1133 Baum Ave N, St. Petersburg',
  mapsUrl: 'https://maps.google.com/?q=Green+Bench+Brewing+1133+Baum+Ave+N+St+Petersburg',
  website: 'https://greenbenchbrewing.com/',
  tapsUrl: 'https://greenbenchbrewing.com/green-bench-tap-list',
  calendarUrl: 'https://greenbenchbrewing.com/events-calendar',
  instagram: 'https://www.instagram.com/greenbenchbrewing/',
  hours: { 0: ['12:00', '21:00'], 1: ['12:00', '22:00'], 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [
    {
      name: 'Tap list',
      run: () =>
        untappdTaps(24757, 94686, 'gb-untappd.js', {
          draft: /light|lukr|hoppy|fermentation|malt|^cider:/i,
          notBeer: /cider/i,
          packaged: /to-go|bottles/i,
          house: /green bench/i,
        }),
    },
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson('https://greenbenchbrewing.com/events-calendar?format=json', { fixture: 'gb-events.json' });
        const items: Item[] = parseSqsCollection(json, 'https://greenbenchbrewing.com')
          // Squarespace lists a repeating event once, spanning months: keep single-day ones.
          .filter((e) => !PRIVATE.test(e.title) && !DEAL.test(e.title) && e.endDate - e.startDate < 86400000)
          .map((e) => ({
            kind: /food\s*truck/i.test(e.title) ? 'food' : 'event',
            title: e.title.trim(),
            start: new Date(e.startDate).toISOString(),
            end: new Date(e.endDate).toISOString(),
            allDay: false,
            url: e.fullUrl,
            description: e.excerpt,
          }));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const mastrys: BreweryDef = {
  id: 'mastrys',
  name: 'Mastry’s Brewing Co.',
  shortName: 'Mastry’s',
  area: 'St. Pete Beach',
  address: '7701 Blind Pass Rd, St. Pete Beach',
  mapsUrl: 'https://maps.google.com/?q=Mastrys+Brewing+7701+Blind+Pass+Rd+St+Pete+Beach',
  website: 'https://www.mastrysbrewingco.com/',
  hoursNote: 'Hours on their website',
  kitchen: { name: 'The Kitchen' },
  sources: [noteOnly('Tap list', 'Mastry’s site only shows its beers in a browser, so they aren’t listed here.')],
};

const seaDog: BreweryDef = {
  id: 'sea-dog',
  name: 'Sea Dog Brewing Co. Treasure Island',
  shortName: 'Sea Dog',
  area: 'Treasure Island',
  address: '9610 Gulf Blvd, Treasure Island',
  mapsUrl: 'https://maps.google.com/?q=Sea+Dog+Brewing+9610+Gulf+Blvd+Treasure+Island',
  website: 'https://seadogbrewing.com/location/treasure-island/',
  instagram: 'https://www.instagram.com/seadogtreasureisland/',
  hours: { 0: ['10:00', '22:00'], 1: ['11:00', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '22:00'], 5: ['11:00', '22:00'], 6: ['10:00', '22:00'] },
  kitchen: { menuUrl: 'https://seadogbrewing.com/location/treasure-island/' },
  sources: [noteOnly('Tap list', 'Sea Dog doesn’t post a tap list for Treasure Island.')],
};

const madBeach: BreweryDef = {
  id: 'mad-beach',
  name: 'Mad Beach Craft Brewing Co.',
  shortName: 'Mad Beach',
  area: 'Madeira Beach',
  address: '12945 Village Blvd, Madeira Beach',
  mapsUrl: 'https://maps.google.com/?q=Mad+Beach+Craft+Brewing+12945+Village+Blvd+Madeira+Beach',
  website: 'https://www.madbeachbrewing.com/',
  tapsUrl: 'https://www.madbeachbrewing.com/tap-list/',
  instagram: 'https://www.instagram.com/madbeachcraftbrewingcompany/',
  hours: { 0: ['11:00', '22:00'], 1: ['11:00', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '22:00'], 5: ['11:00', '22:00'], 6: ['11:00', '22:00'] },
  kitchen: { menuUrl: 'https://www.madbeachbrewing.com/menu/' },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // The first group on the page is what's pouring now ("Drink lightest in color… first");
        // the groups after it are their full catalogue by style. Each item: "Name | Style | 5% ABV | 20 IBU".
        const html = await fetchText('https://www.madbeachbrewing.com/tap-list/', { fixture: 'mb-tap.html', respectRobots: true });
        const $ = cheerio.load(html);
        const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
        const taps: Beer[] = [];
        let inCurrent = false;
        $('h1, h2, h3, h4, .menu-item').each((_, el) => {
          if (!$(el).hasClass('menu-item')) {
            const h = text(el);
            if (/lightest/i.test(h)) inCurrent = true;
            else if (inCurrent && h) inCurrent = false;
            return;
          }
          if (!inCurrent) return;
          const [rawName, style, abvPart] = text($(el).find('.menutitle').first()).split('|').map((s) => s.trim());
          if (!rawName) return;
          const name = rawName.replace(/\s*\(GF\)\s*$/i, '');
          const abv = abvPart?.match(/(\d+(?:\.\d+)?)\s*%/);
          const desc = text($(el).find('.description').first()) || undefined;
          taps.push(
            beer({
              name,
              style: style?.replace(/\s*–\s*/g, ' - ') || styleFromName(name),
              abv: abv ? Number(abv[1]) : undefined,
              description: desc,
              notBeer: /sangria|mead|cider|wine/i.test(`${name} ${style ?? ''}`) ? true : undefined,
            }),
          );
        });
        return { taps };
      },
    },
  ],
};

const gulfport: BreweryDef = {
  id: 'gulfport',
  name: 'Gulfport Brewery + Eatery',
  shortName: 'Gulfport Brewery',
  area: 'Gulfport',
  address: '3007 Beach Blvd S, Gulfport',
  mapsUrl: 'https://maps.google.com/?q=Gulfport+Brewery+3007+Beach+Blvd+S+Gulfport',
  website: 'https://gulfport-brewing.com/',
  tapsUrl: 'https://untappd.com/v/gulfport-brewery-eatery/10136143',
  instagram: 'https://www.instagram.com/gulfportbrewery/',
  hoursNote: 'Hours on their website',
  kitchen: { menuUrl: 'https://gulfport-brewing.com/' },
  sources: [
    noteOnly(
      'Tap list',
      'Gulfport Brewery keeps its tap list on Untappd. Flagships: Gulfport Gold, Hippie Oasis IPA, Unsteady Freddy West Coast IPA and The Orange Stuff sour.',
    ),
  ],
};

export const BREWERIES: BreweryDef[] = [
  grandCentral,
  ratc,
  cage,
  pinellasAleWorks,
  threeDaughters,
  bayboro,
  stPeteBrewing,
  overflow,
  greenBench,
  mastrys,
  seaDog,
  madBeach,
  gulfport,
];
