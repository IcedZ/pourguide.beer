import type { Beer, Item } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { parseSqsCollection } from '@guide/lib/parsers/squarespace';
import { beerMenusUrl, fetchBeerMenusWidget, parseBeerMenus, type BeerMenusItem } from '@guide/lib/parsers/beermenus';
import { beer, inWindow, noteOnly, PRIVATE, type BreweryDef } from '@guide/lib/kit';

// Tampa's breweries by neighborhood (November 2026), from Visit Tampa Bay's Bay Crafted guide
// and local news. Left out: Tampa Bay Brewing's Ybor taproom (closed May 2026), Florida Avenue's
// Seminole Heights taproom (closed Nov 2026), Southern Brewing & Winemaking (closed 2026) and
// 7venth Sun's Seminole Heights taproom (no longer listed on their site).

const DEAL = /\$\s?\d|\d+\s?% off|happy hour|\bspecials?\b|mug club/i;
const NOT_BEER = /cider|seltzer|mead|wine|kombucha|soda|cocktail/i;

/** BeerMenus items → taps. House beers are the ones brewed in Tampa; the rest are guests. */
function beerMenusTaps(items: BeerMenusItem[], house: RegExp): { taps: Beer[]; tapsNote?: string } {
  const poured = items.filter((i) => (i.section ? /tap|draft/i.test(i.section) : true) && (i.servings.length === 0 || i.servings.includes('Draft')));
  const toGo = items.length - poured.length;
  return {
    taps: poured.map((i) =>
      beer({
        name: i.name.replace(house, '').replace(/^\s*\+\s*/, '').trim() || i.name,
        style: i.style,
        abv: i.abv,
        description: i.description,
        category: i.from && !/tampa/i.test(i.from) ? 'Guest' : undefined,
        notBeer: NOT_BEER.test(i.style ?? '') ? true : undefined,
      }),
    ),
    tapsNote: toGo ? `Plus ${toGo} cans and bottles to go.` : undefined,
  };
}

// ------------------------------------------------------------------ Ybor City

const coppertail: BreweryDef = {
  id: 'coppertail',
  name: 'Coppertail Brewing Co.',
  shortName: 'Coppertail',
  area: 'Ybor City',
  address: '2601 E 2nd Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Coppertail+Brewing+2601+E+2nd+Ave+Tampa',
  website: 'https://www.coppertailbrewing.com/',
  instagram: 'https://www.instagram.com/coppertailbrewing/',
  hoursNote: 'Hours on their website',
  kitchen: {},
  sources: [noteOnly('Tap list', 'Coppertail doesn’t post its tap list online.')],
};

const barriehaus: BreweryDef = {
  id: 'barriehaus',
  name: 'BarrieHaus Beer Co.',
  shortName: 'BarrieHaus',
  area: 'Ybor City',
  address: '1403 E 5th Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=BarrieHaus+Beer+Co+1403+E+5th+Ave+Tampa',
  website: 'https://barriehaus.com/',
  tapsUrl: 'https://barriehaus.com/beer/',
  calendarUrl: 'https://barriehaus.com/tampa-events/',
  hoursNote: 'Hours on their website',
  sources: [noteOnly('Tap list', 'BarrieHaus lists its beers but not what’s pouring today. Mostly German-style lagers.')],
};

const skyPuppy: BreweryDef = {
  id: 'sky-puppy',
  name: 'Sky Puppy Brewing',
  shortName: 'Sky Puppy',
  area: 'Ybor City',
  address: '1313 E 8th Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Sky+Puppy+Brewing+1313+E+8th+Ave+Tampa',
  website: 'https://www.skypuppybrewing.com/',
  hours: { 0: ['12:00', '19:00'], 1: null, 2: null, 3: ['15:00', '20:00'], 4: ['15:00', '20:00'], 5: ['13:00', '23:00'], 6: ['13:00', '23:00'] },
  sources: [noteOnly('Tap list', 'Sky Puppy doesn’t post its tap list online. Hours change around private events.')],
};

const cigarCity: BreweryDef = {
  id: 'cigar-city',
  name: 'Cigar City Brewing',
  shortName: 'Cigar City',
  area: 'Ybor City',
  address: '1812 N 15th St, Tampa',
  mapsUrl: 'https://maps.google.com/?q=1812+N+15th+St+Tampa',
  website: 'https://cigarcitybrewing.com/location/taproom/',
  instagram: 'https://www.instagram.com/cigarcitybrewing/',
  hoursNote: 'Opening soon',
  sources: [noteOnly('Tap list', 'Cigar City has left Spruce Street and is moving into Ybor City. The new taproom hasn’t opened yet.')],
};

// ------------------------------------------------------------------ Seminole Heights

const angryChair: BreweryDef = {
  id: 'angry-chair',
  name: 'Angry Chair Brewing',
  shortName: 'Angry Chair',
  area: 'Seminole Heights',
  address: '4101 N Florida Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Angry+Chair+Brewing+4101+N+Florida+Ave+Tampa',
  website: 'https://angrychairbrewing.com/location/taproom/',
  tapsUrl: 'https://angrychairbrewing.com/location/taproom/',
  calendarUrl: 'https://angrychairbrewing.com/events/',
  instagram: 'https://www.instagram.com/angrychairbrewing/',
  hours: { 0: ['11:00', '20:00'], 1: ['11:00', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'], 4: ['11:00', '22:00'], 5: ['11:00', '23:00'], 6: ['11:00', '23:00'] },
  kitchen: { menuUrl: 'https://angrychairbrewing.com/location/taproom/' },
  sources: [
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText(beerMenusUrl(301), { fixture: 'ac-beermenus.html' });
        return beerMenusTaps(parseBeerMenus(html), /^Angry Chair\b/i);
      },
    },
  ],
};

const commonDialect: BreweryDef = {
  id: 'common-dialect',
  name: 'Common Dialect Beerworks',
  shortName: 'Common Dialect',
  area: 'Seminole Heights',
  address: '5023 N Florida Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Common+Dialect+5023+N+Florida+Ave+Tampa',
  website: 'https://www.commondialectbeer.com/',
  tapsUrl: 'https://www.commondialectbeer.com/tap-list',
  calendarUrl: 'https://www.commondialectbeer.com/calendar',
  hours: { 0: ['12:00', '21:00'], 1: ['17:00', '22:00'], 2: ['15:00', '22:00'], 3: ['15:00', '22:00'], 4: ['15:00', '23:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  kitchen: { menuUrl: 'https://www.commondialectbeer.com/brewery-food-tampa' },
  sources: [
    noteOnly('Tap list', 'Common Dialect’s tap list only loads in a browser, so it isn’t shown here.'),
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson('https://www.commondialectbeer.com/calendar?format=json', { fixture: 'cd-events.json' });
        const items: Item[] = parseSqsCollection(json, 'https://www.commondialectbeer.com')
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

const magnanimousSeminole: BreweryDef = {
  id: 'magnanimous-seminole',
  name: 'Magnanimous Brewing (Seminole Heights)',
  shortName: 'Magnanimous',
  area: 'Seminole Heights',
  address: '6809 N Nebraska Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Magnanimous+Brewing+6809+N+Nebraska+Ave+Tampa',
  website: 'https://www.magnanimousbrewing.com/seminole-heights',
  tapsUrl: 'https://www.magnanimousbrewing.com/seminole-heights',
  calendarUrl: 'https://www.magnanimousbrewing.com/taproom-events',
  instagram: 'https://www.instagram.com/magnanimousbrewing/',
  hours: { 0: ['12:00', '22:00'], 1: ['12:00', '22:00'], 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '22:00'], 6: ['12:00', '22:00'] },
  sources: [
    {
      name: 'Tap list',
      run: async () => beerMenusTaps(await fetchBeerMenusWidget(84916, 'mag-sh-widget.js'), /^Magnanimous\b/i),
    },
  ],
};

const ology: BreweryDef = {
  id: 'ology',
  name: 'Ology Brewing (Tampa)',
  shortName: 'Ology',
  area: 'Seminole Heights',
  address: '6401 N Florida Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Ology+Brewing+6401+N+Florida+Ave+Tampa',
  website: 'https://www.ologybrewing.com/',
  hours: { 0: ['12:00', '20:00'], 1: ['16:00', '22:00'], 2: ['16:00', '22:00'], 3: ['16:00', '22:00'], 4: ['16:00', '22:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [noteOnly('Tap list', 'Ology doesn’t post its Tampa tap list online.')],
};

// ------------------------------------------------------------------ Tampa Heights & Downtown

const magnanimousTampaHeights: BreweryDef = {
  id: 'magnanimous-tampa-heights',
  name: 'Magnanimous Brewing (Tampa Heights)',
  shortName: 'Magnanimous',
  area: 'Tampa Heights',
  address: '1420 N Florida Ave, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Magnanimous+Brewing+1420+N+Florida+Ave+Tampa',
  website: 'https://www.magnanimousbrewing.com/tampa-heights',
  tapsUrl: 'https://www.magnanimousbrewing.com/tampa-heights',
  calendarUrl: 'https://www.magnanimousbrewing.com/taproom-events',
  instagram: 'https://www.instagram.com/magnanimousbrewing/',
  hours: { 0: ['12:00', '21:00'], 1: ['16:00', '22:00'], 2: ['16:00', '22:00'], 3: ['16:00', '22:00'], 4: ['16:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      run: async () => beerMenusTaps(await fetchBeerMenusWidget(86852, 'mag-th-widget.js'), /^Magnanimous\b/i),
    },
  ],
};

const hiddenSprings: BreweryDef = {
  id: 'hidden-springs',
  name: 'Hidden Springs Ale Works',
  shortName: 'Hidden Springs',
  area: 'Tampa Heights',
  address: '1631 N Franklin St, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Hidden+Springs+Ale+Works+1631+N+Franklin+St+Tampa',
  website: 'https://www.hiddenspringsaleworks.com/',
  hoursNote: 'Hours on their website',
  sources: [noteOnly('Tap list', 'Hidden Springs doesn’t post its tap list online.')],
};

const greenBenchTampa: BreweryDef = {
  id: 'green-bench-tampa',
  name: 'Green Bench Brewing Co. (Tampa)',
  shortName: 'Green Bench',
  area: 'Downtown',
  address: '200 N Tampa St, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Green+Bench+Brewing+200+N+Tampa+St+Tampa',
  website: 'https://greenbenchbrewing.com/',
  instagram: 'https://www.instagram.com/greenbenchbrewing/',
  hoursNote: 'Hours on their website',
  sources: [noteOnly('Tap list', 'Green Bench’s Tampa tasting room opened in 2026; its tap list isn’t online yet.')],
};

// ------------------------------------------------------------------ Around town

const tbbcWestchase: BreweryDef = {
  id: 'tbbc-westchase',
  name: 'Tampa Bay Brewing Co. (Westchase)',
  shortName: 'Tampa Bay Brewing',
  area: 'Westchase',
  address: '13937 Monroes Business Park, Tampa',
  mapsUrl: 'https://maps.google.com/?q=Tampa+Bay+Brewing+13937+Monroes+Business+Park+Tampa',
  website: 'https://maps.google.com/?q=Tampa+Bay+Brewing+13937+Monroes+Business+Park+Tampa',
  hoursNote: 'Check before you go',
  kitchen: {},
  sources: [noteOnly('Tap list', 'Tampa Bay Brewing’s website is down; its Westchase brewpub is still open.')],
};

export const BREWERIES: BreweryDef[] = [
  coppertail,
  barriehaus,
  skyPuppy,
  cigarCity,
  angryChair,
  commonDialect,
  magnanimousSeminole,
  ology,
  magnanimousTampaHeights,
  hiddenSprings,
  greenBenchTampa,
  tbbcWestchase,
];
