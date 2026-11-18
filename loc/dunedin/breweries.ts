import type { Beer, Item, ToGoItem } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { parseSqsCollection } from '@guide/lib/parsers/squarespace';
import { parseCraftpeakTaplist } from '@guide/lib/parsers/craftpeak';
import { parseSpotEvents, parseSpotMenu, type SpotMenuItem } from '@guide/lib/parsers/spothopper';
import { parseZoogleEvents, zoogleTimes } from '@guide/lib/parsers/zoogle';
import { parseEventerList } from '@guide/lib/parsers/eventer';
import { beer, inWindow, noteOnly, PRIVATE, styleFromName, untappdTaps, type BreweryDef } from '@guide/lib/kit';

// Dunedin's breweries, from the north region of Visit St. Pete/Clearwater's Gulp Coast
// beer trail (November 2026). Truck & Ladder (formerly Beach Island Brewery) is closed.

/** Specials and happy hours aren't events. */
const DEAL = /\$\s?\d|\d+\s?% off|happy hour|\bspecials?\b|appreciation|burger mondays?|taco tuesdays?/i;

/** "7% American IPA" / "Hazy IPA - 6.2% ABV 24 IBU" → style and ABV. */
function specLine(s = ''): { style?: string; abv?: number } {
  const abv = s.match(/(\d+(?:\.\d+)?)\s*%/);
  const lead = s
    .replace(/(?:ABV:?\s*)?\d+(?:\.\d+)?\s*%\s*(?:ABV)?/i, ' ')
    .split(/\s[-–•]\s|\.|,|\t|\bIBU\b/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const style = lead && lead.length <= 28 && !/\d/.test(lead) ? lead : styleFromName(s);
  return { style: style || undefined, abv: abv ? Number(abv[1]) : undefined };
}

const NOT_BEER = /cider|wine|seltzer|sangria|mimosa|prosecco|kombucha|soda|root beer/i;

const sevenSun: BreweryDef = {
  id: '7venth-sun',
  name: '7venth Sun Brewery',
  shortName: '7venth Sun',
  area: 'Downtown Dunedin',
  address: '1012 Broadway, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=7venth+Sun+Brewery+1012+Broadway+Dunedin',
  website: 'https://7venthsun.com/location/dunedin/',
  tapsUrl: 'https://7venthsun.com/location/dunedin/#on-tap',
  calendarUrl: 'https://7venthsun.com/events/',
  instagram: 'https://www.instagram.com/7venthsun/',
  hours: { 0: ['12:00', '22:00'], 1: ['12:00', '22:00'], 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Craftpeak site: the Dunedin page lists draft, cans and guest beers with format icons.
        const html = await fetchText('https://7venthsun.com/location/dunedin/', { fixture: '7s-dunedin.html', respectRobots: true });
        const taps: Beer[] = [];
        const toGo: ToGoItem[] = [];
        for (const it of parseCraftpeakTaplist(html)) {
          const style = it.descriptor && it.descriptor.length <= 26 ? it.descriptor : styleFromName(`${it.name} ${it.descriptor ?? ''}`);
          if (it.draft) {
            taps.push(
              beer({
                name: it.name,
                style,
                abv: it.abv,
                description: it.descriptor && it.descriptor !== style ? it.descriptor : undefined,
                category: it.guest ? 'Guest' : undefined,
                notBeer: NOT_BEER.test(`${it.name} ${it.descriptor ?? ''}`) && !/sour/i.test(it.descriptor ?? '') ? true : undefined,
              }),
            );
          } else if (it.packaged) {
            toGo.push({ name: it.name, style, size: 'Cans' });
          }
        }
        return { taps, toGo };
      },
    },
  ],
};

/** Soggy Bottom and Cueni both use SpotHopper sites. */
async function spotEvents(url: string, fixture: string, ctx: { windowStart: Date; windowEnd: Date }): Promise<Item[]> {
  const html = await fetchText(url, { fixture, respectRobots: true });
  return parseSpotEvents(html, ctx.windowStart, ctx.windowEnd, {
    ignore: new RegExp(`${DEAL.source}|${PRIVATE.source}`, 'i'),
    kind: (t) => (/food\s*truck/i.test(t) ? 'food' : 'event'),
  });
}

const soggyBottom: BreweryDef = {
  id: 'soggy-bottom',
  name: 'Soggy Bottom Brewing Co.',
  shortName: 'Soggy Bottom',
  area: 'Downtown Dunedin',
  address: '662 Main St, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=Soggy+Bottom+Brewing+662+Main+St+Dunedin',
  website: 'https://soggybottombrewing.com/',
  tapsUrl: 'https://soggybottombrewing.com/menus',
  calendarUrl: 'https://soggybottombrewing.com/events',
  instagram: 'https://www.instagram.com/soggybottombrewingco/',
  hours: { 0: ['12:00', '00:00'], 1: ['12:00', '00:00'], 2: ['12:00', '00:00'], 3: ['12:00', '00:00'], 4: ['12:00', '00:00'], 5: ['12:00', '02:00'], 6: ['12:00', '02:00'] },
  kitchen: { menuUrl: 'https://soggybottombrewing.com/food-menu' },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // House beers on /menus ("Our Beers on Tap"); guest taps on /drink-menu's Beer tab.
        const house = parseSpotMenu(await fetchText('https://soggybottombrewing.com/menus', { fixture: 'sb-menus.html', respectRobots: true }));
        const drinks = parseSpotMenu(await fetchText('https://soggybottombrewing.com/drink-menu', { fixture: 'sb-drink.html', respectRobots: true }));
        const mk = (i: SpotMenuItem, guest: boolean) => {
          const spec = specLine(i.description);
          const style = spec.style ?? styleFromName(i.name);
          return beer({
            name: i.name,
            style,
            abv: spec.abv,
            description: i.description && i.description !== style ? i.description : undefined,
            category: guest ? 'Guest' : undefined,
            notBeer: NOT_BEER.test(`${i.name} ${i.description ?? ''}`) ? true : undefined,
          });
        };
        const taps = [
          ...house.filter((i) => /on tap/i.test(i.section ?? '')).map((i) => mk(i, false)),
          ...drinks.filter((i) => /guest/i.test(i.section ?? '')).map((i) => mk(i, true)),
        ];
        const others = drinks.filter((i) => /wine|rtd|cocktail/i.test(`${i.tab} ${i.section ?? ''}`)).length;
        return { taps, tapsNote: others ? 'Plus wine and canned cocktails.' : undefined };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        return { items: await spotEvents('https://soggybottombrewing.com/events', 'sb-events.html', ctx) };
      },
    },
  ],
};

const cueni: BreweryDef = {
  id: 'cueni',
  name: 'Cueni Brewing Co.',
  shortName: 'Cueni',
  area: 'Downtown Dunedin',
  address: '945 Huntley Ave, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=Cueni+Brewing+945+Huntley+Ave+Dunedin',
  website: 'https://www.cuenibrewing.com/',
  tapsUrl: 'https://www.cuenibrewing.com/dunedin-cueni-brewing-drink-menu',
  calendarUrl: 'https://www.cuenibrewing.com/dunedin-cueni-brewing-events',
  instagram: 'https://www.instagram.com/cuenibrewingco/',
  hours: { 0: ['12:00', '20:00'], 1: ['15:00', '21:00'], 2: ['15:00', '21:00'], 3: ['15:00', '21:00'], 4: ['15:00', '21:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        const items = parseSpotMenu(await fetchText('https://www.cuenibrewing.com/dunedin-cueni-brewing-drink-menu', { fixture: 'cu-drink.html', respectRobots: true }));
        const taps = items
          .filter((i) => /draft/i.test(i.tab))
          .map((i) => {
            const spec = specLine(i.description);
            const style = spec.style ?? styleFromName(i.name);
            return beer({
              name: i.name,
              style,
              abv: spec.abv,
              description: i.description,
              notBeer: NOT_BEER.test(`${i.name} ${style ?? ''}`) ? true : undefined,
            });
          });
        const cans = items.filter((i) => /can/i.test(i.tab)).length;
        return { taps, tapsNote: cans ? `Plus ${cans} canned seltzers and NA beers, wine and cider.` : undefined };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        return { items: await spotEvents('https://www.cuenibrewing.com/dunedin-cueni-brewing-events', 'cu-events.html', ctx) };
      },
    },
  ],
};

const hob: BreweryDef = {
  id: 'hob',
  name: 'HOB Brewing Co.',
  shortName: 'HOB',
  area: 'Downtown Dunedin',
  address: '931 Huntley Ave, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=HOB+Brewing+931+Huntley+Ave+Dunedin',
  website: 'https://hob.beer/',
  tapsUrl: 'https://hob.beer/beers',
  calendarUrl: 'https://hob.beer/events',
  instagram: 'https://www.instagram.com/hobbrewingco/',
  hoursNote: 'Hours on their website',
  sources: [
    {
      name: 'Tap list',
      run: () => untappdTaps(27940, 107338, 'hob-untappd.js', { house: /\bHOB\b/i }),
    },
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson('https://hob.beer/events?format=json', { fixture: 'hob-events.json' });
        const items: Item[] = parseSqsCollection(json, 'https://hob.beer')
          .filter((e) => !PRIVATE.test(e.title) && !DEAL.test(e.title))
          .map((e) => ({
            kind: /food\s*truck|market/i.test(e.title) && !/live music/i.test(e.title) ? 'food' : 'event',
            title: e.title.replace(/^Live Music\s*[-–]\s*/i, 'Live music: '),
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

const caledonia: BreweryDef = {
  id: 'caledonia',
  name: 'Caledonia Brewing',
  shortName: 'Caledonia',
  area: 'Downtown Dunedin',
  address: '587 Main St, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=Caledonia+Brewing+587+Main+St+Dunedin',
  website: 'https://www.caledoniabrewing.com/',
  tapsUrl: 'https://www.caledoniabrewing.com/current-menu/',
  calendarUrl: 'https://www.caledoniabrewing.com/upcoming-events/',
  instagram: 'https://www.instagram.com/caledoniabrewing/',
  hours: { 0: ['12:00', '22:00'], 1: ['14:00', '00:00'], 2: ['14:00', '00:00'], 3: ['14:00', '00:00'], 4: ['14:00', '00:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [
    {
      name: 'Tap list',
      run: () =>
        untappdTaps(24161, 92314, 'cal-untappd.js', {
          draft: /on tap/i,
          notBeer: /cider/i,
          packaged: /wine|canned|non alcoholic/i,
          ignore: /charcuterie|snacks|merch|shirts|soft drinks/i,
          house: /caledonia/i,
        }),
    },
  ],
};

const woodwright: BreweryDef = {
  id: 'woodwright',
  name: 'Woodwright Brewing Co.',
  shortName: 'Woodwright',
  area: 'Downtown Dunedin',
  address: '985 Douglas Ave, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=Woodwright+Brewing+985+Douglas+Ave+Dunedin',
  website: 'https://woodwrightbrewing.com/',
  calendarUrl: 'https://woodwrightbrewing.com/events/',
  hours: { 0: ['13:00', '18:00'], 1: null, 2: null, 3: null, 4: ['17:00', '23:00'], 5: ['13:00', '23:00'], 6: ['13:00', '23:00'] },
  kitchen: { name: 'The Duneatery' },
  sources: [
    noteOnly('Tap list', 'Woodwright doesn’t post its tap list online.'),
    {
      name: 'Events',
      async run(ctx) {
        const html = await fetchText('https://woodwrightbrewing.com/events/', { fixture: 'ww-events.html', respectRobots: true });
        // The calendar also carries opening-hours notices ("Closed – Happy Thanksgiving", "Open 5–11pm").
        const items = parseEventerList(html).filter((e) => !/^(closed|open)\b/i.test(e.title) && !PRIVATE.test(e.title));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const dunedinBrewery: BreweryDef = {
  id: 'dunedin-brewery',
  name: 'Dunedin Brewery',
  area: 'Downtown Dunedin',
  address: '937 Douglas Ave, Dunedin',
  mapsUrl: 'https://maps.google.com/?q=Dunedin+Brewery+937+Douglas+Ave+Dunedin',
  website: 'https://dunedinbrewery.com/',
  tapsUrl: 'https://dunedinbrewery.com/beer',
  calendarUrl: 'https://dunedinbrewery.com/live-music-calendar',
  instagram: 'https://www.instagram.com/dunedinbrewery/',
  hours: { 0: ['11:00', '20:00'], 1: ['11:00', '21:00'], 2: ['11:00', '21:00'], 3: ['11:00', '23:00'], 4: ['11:00', '22:00'], 5: ['11:00', '00:00'], 6: ['11:00', '00:00'] },
  kitchen: { menuUrl: 'https://dunedinbrewery.com/food' },
  sources: [
    noteOnly(
      'Tap list',
      'Dunedin Brewery doesn’t post its tap list. Usually pouring: Apricot Peach Ale, American Classic IPA, AIR Lager, BOP! Wheat Ale, Redhead Red and Beach Tale Brown Ale.',
    ),
    {
      name: 'Live music',
      async run(ctx) {
        const html = await fetchText('https://dunedinbrewery.com/live-music-calendar', { fixture: 'db-events.html', respectRobots: true });
        const items: Item[] = parseZoogleEvents(html, ctx.windowStart)
          .filter((e) => !DEAL.test(e.title) && !PRIVATE.test(e.title))
          .map((e) => ({ kind: 'event', title: e.title, ...zoogleTimes(e), url: e.url, description: e.notes }));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

export const BREWERIES: BreweryDef[] = [sevenSun, caledonia, cueni, dunedinBrewery, hob, soggyBottom, woodwright];
