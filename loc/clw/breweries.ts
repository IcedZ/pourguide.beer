import type { Item } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { expandIcs, googleIcsUrl } from '@guide/lib/parsers/ics';
import { fetchBentoEvents } from '@guide/lib/parsers/bentobox';
import { cheerio, decodeEntities, tidyCase } from '@guide/lib/parsers/html';
import { dayKey } from '@guide/lib/time';
import { fromIcs, inWindow, noteOnly, PRIVATE, tribeItems, untappdTaps, type BreweryDef } from '@guide/lib/kit';

// The central and north regions of Visit St. Pete/Clearwater's Gulp Coast beer trail
// (November 2026), minus Dunedin, which has its own guide. Plus 3 Daughters' Clearwater
// Beach tasting room. Troubled Waters (Safety Harbor) is left out: its website has lapsed
// and we couldn't confirm it's still open.

const DEAL = /\$\s?\d|\d+\s?% off|happy hour|\bspecials?\b|mug club/i;

// ------------------------------------------------------------------ Tarpon Springs

const brighterDays: BreweryDef = {
  id: 'brighter-days',
  name: 'Brighter Days Brewing Co.',
  shortName: 'Brighter Days',
  area: 'Tarpon Springs',
  address: '311 N Safford Ave, Tarpon Springs',
  mapsUrl: 'https://maps.google.com/?q=Brighter+Days+Brewing+311+N+Safford+Ave+Tarpon+Springs',
  website: 'https://www.visitstpeteclearwater.com/eat-drink/gulp-coast-beer-trail/north',
  hoursNote: 'Check before you go',
  sources: [noteOnly('Tap list', 'Brighter Days only posts on Facebook. Right on the Pinellas Trail, with a walk-up window.')],
};

const twoFrogs: BreweryDef = {
  id: 'two-frogs',
  name: 'Two Frogs Brewing Company',
  shortName: 'Two Frogs',
  area: 'Tarpon Springs',
  address: '151 E Tarpon Ave, Tarpon Springs',
  mapsUrl: 'https://maps.google.com/?q=Two+Frogs+Brewing+151+E+Tarpon+Ave+Tarpon+Springs',
  website: 'https://www.visitstpeteclearwater.com/profile/two-frogs-brewing-company/140654',
  hours: { 0: ['13:00', '18:00'], 1: null, 2: null, 3: ['14:00', '20:00'], 4: ['14:00', '20:00'], 5: ['16:00', '22:00'], 6: ['13:00', '22:00'] },
  sources: [noteOnly('Tap list', 'Two Frogs doesn’t have a website with its tap list.')],
};

const unrefined: BreweryDef = {
  id: 'unrefined',
  name: 'Unrefined Brewing',
  shortName: 'Unrefined',
  area: 'Tarpon Springs',
  address: '312 E Tarpon Ave, Tarpon Springs',
  mapsUrl: 'https://maps.google.com/?q=Unrefined+Brewing+312+E+Tarpon+Ave+Tarpon+Springs',
  website: 'https://www.unrefinedbrewing.com/',
  tapsUrl: 'https://www.unrefinedbrewing.com/menus',
  calendarUrl: 'https://www.unrefinedbrewing.com/events-1',
  hours: { 0: ['12:00', '20:00'], 1: null, 2: null, 3: null, 4: ['13:00', '22:00'], 5: ['12:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [noteOnly('Tap list', 'Unrefined’s menu only loads in a browser, so it isn’t shown here.')],
};

// ------------------------------------------------------------------ Palm Harbor

const deBine: BreweryDef = {
  id: 'de-bine',
  name: 'de Bine Brewing Co.',
  shortName: 'de Bine',
  area: 'Palm Harbor',
  address: '993 Florida Ave, Palm Harbor',
  mapsUrl: 'https://maps.google.com/?q=de+Bine+Brewing+993+Florida+Ave+Palm+Harbor',
  website: 'https://www.debinebrewingco.com/',
  tapsUrl: 'https://www.debinebrewingco.com/brews-on-tap/',
  instagram: 'https://www.instagram.com/debinebrews/',
  hours: { 0: ['12:00', '22:00'], 1: ['15:00', '22:00'], 2: ['15:00', '22:00'], 3: ['15:00', '23:00'], 4: ['15:00', '23:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [{ name: 'Tap list', run: () => untappdTaps(7998, 28213, 'debine-untappd.js', { ignore: /food|merch/i, house: /de ?bine/i }) }],
};

const stiltHouse: BreweryDef = {
  id: 'stilt-house',
  name: 'Stilt House Brewery',
  shortName: 'Stilt House',
  area: 'Palm Harbor',
  address: '625 Alt 19, Palm Harbor',
  mapsUrl: 'https://maps.google.com/?q=Stilt+House+Brewery+625+Alt+19+Palm+Harbor',
  website: 'https://www.visitstpeteclearwater.com/profile/stilt-house-brewery/138746',
  hoursNote: 'Check before you go',
  sources: [noteOnly('Tap list', 'Stilt House’s website is down. Usually 20-plus house beers on tap, right on the Pinellas Trail.')],
};

// ------------------------------------------------------------------ Clearwater & Safety Harbor

const crookedThumb: BreweryDef = {
  id: 'crooked-thumb',
  name: 'Crooked Thumb Brewery',
  shortName: 'Crooked Thumb',
  area: 'Safety Harbor',
  address: '555 10th Ave S, Safety Harbor',
  mapsUrl: 'https://maps.google.com/?q=Crooked+Thumb+Brewery+555+10th+Ave+S+Safety+Harbor',
  website: 'https://crookedthumbbrew.com/',
  tapsUrl: 'https://crookedthumbbrew.com/whats-on-tap/',
  calendarUrl: 'https://crookedthumbbrew.com/events-calendar/',
  instagram: 'https://www.instagram.com/crookedthumbbrew/',
  hours: { 0: ['12:00', '21:00'], 1: ['16:00', '21:00'], 2: ['16:00', '21:00'], 3: ['16:00', '21:00'], 4: ['16:00', '21:00'], 5: ['14:00', '23:00'], 6: ['12:00', '23:00'] },
  sources: [{ name: 'Tap list', run: () => untappdTaps(25550, 97846, 'ct-untappd.js', { ignore: /food|merch/i, house: /crooked thumb/i }) }],
};

const southernLights: BreweryDef = {
  id: 'southern-lights',
  name: 'Southern Lights Brewing Co.',
  shortName: 'Southern Lights',
  area: 'Clearwater',
  address: '2075 Sunnydale Blvd, Clearwater',
  mapsUrl: 'https://maps.google.com/?q=Southern+Lights+Brewing+2075+Sunnydale+Blvd+Clearwater',
  website: 'https://www.southernlightsbrewing.com/',
  tapsUrl: 'https://www.southernlightsbrewing.com/menus/',
  calendarUrl: 'https://www.southernlightsbrewing.com/events/',
  instagram: 'https://www.instagram.com/southernlightsbrewing/',
  hoursNote: 'Hours on their website',
  sources: [
    noteOnly('Tap list', 'Southern Lights lists its beers but not what’s pouring today.'),
    {
      name: 'Food trucks & events',
      async run(ctx) {
        const evs = await fetchBentoEvents('https://www.southernlightsbrewing.com', 'sl');
        const items: Item[] = evs
          .filter((e) => !PRIVATE.test(e.title) && !DEAL.test(e.title))
          .map((e) => ({
            kind: /food\s*truck|tacos?\b|bbq|pizza|burgers?|kitchen|eats\b/i.test(e.title) ? 'food' : 'event',
            title: e.title,
            start: e.start,
            allDay: false,
            url: e.url,
            description: e.description,
          }));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

const grindhaus: BreweryDef = {
  id: 'grindhaus',
  name: 'Grindhaus Brew Lab',
  shortName: 'Grindhaus',
  area: 'Clearwater',
  address: '1650 N Hercules Ave, Unit I, Clearwater',
  mapsUrl: 'https://maps.google.com/?q=Grindhaus+Brew+Lab+1650+N+Hercules+Ave+Clearwater',
  website: 'https://grindhausbrewlab.com/',
  tapsUrl: 'https://grindhausbrewlab.com/on-tap/',
  hours: { 0: ['14:00', '19:00'], 1: null, 2: null, 3: null, 4: ['14:00', '22:00'], 5: ['14:00', '23:00'], 6: ['14:00', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run(ctx) {
        // Grindhaus writes a short update about what's new on tap, not a full list.
        // Show it only while it's recent ("Updated 11.13 @ 2pm").
        const html = await fetchText('https://grindhausbrewlab.com/on-tap/', { fixture: 'gh-tap.html', respectRobots: true });
        const $ = cheerio.load(html);
        const paras = $('.entry-content p')
          .map((_, p) => decodeEntities($(p).text()).replace(/\s+/g, ' ').trim())
          .get()
          .filter(Boolean);
        const text = paras.join(' ');
        const upd = text.match(/Updated\s+(\d{1,2})\.(\d{1,2})/i);
        const today = dayKey(ctx.windowStart);
        let fresh = false;
        if (upd) {
          const y = Number(today.slice(0, 4));
          const mm = String(upd[1]).padStart(2, '0');
          const dd = String(upd[2]).padStart(2, '0');
          let d = `${y}-${mm}-${dd}`;
          if (d > today) d = `${y - 1}-${mm}-${dd}`;
          fresh = (Date.parse(today) - Date.parse(d)) / 86400000 <= 1;
        }
        const note = text.replace(/\s*Updated\s+\d.*$/i, '').slice(0, 400);
        return {
          taps: [],
          tapsNote: fresh && note ? `From their latest update (${upd![1]}/${upd![2]}): “${note}”` : 'Grindhaus posts short tap updates on its website instead of a full list.',
        };
      },
    },
  ],
};

const threeDaughtersBeach: BreweryDef = {
  id: '3-daughters-beach',
  name: '3 Daughters Brewing Clearwater Beach',
  shortName: '3 Daughters',
  area: 'Clearwater Beach',
  address: '381 Mandalay Ave, 3rd floor, Clearwater Beach',
  mapsUrl: 'https://maps.google.com/?q=3+Daughters+Brewing+381+Mandalay+Ave+Clearwater+Beach',
  website: 'https://3dbrewing.com/',
  calendarUrl: 'https://3dbrewing.com/events/',
  instagram: 'https://www.instagram.com/3daughtersbrewing/',
  hoursNote: 'Hours on their website',
  sources: [
    noteOnly('Tap list', '3 Daughters doesn’t post its Clearwater Beach tap list online. Rooftop views of Pier 60.'),
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson(
          `https://3dbrewing.com/wp-json/tribe/events/v1/events?per_page=50&start_date=${dayKey(ctx.windowStart)}`,
          { fixture: '3d-events.json' },
        );
        const events = (json.events ?? []).filter((e: any) => (e.categories ?? []).some((c: any) => /clearwater/i.test(c.name ?? '')));
        const items = tribeItems({ events }).filter((i) => !DEAL.test(i.title));
        return { items: inWindow(items, ctx) };
      },
    },
  ],
};

// ------------------------------------------------------------------ Largo, Seminole & the beaches

const arkane: BreweryDef = {
  id: 'arkane',
  name: 'Arkane Aleworks',
  shortName: 'Arkane',
  area: 'Largo',
  address: '2480 E Bay Dr, Suite 23, Largo',
  mapsUrl: 'https://maps.google.com/?q=Arkane+Aleworks+2480+E+Bay+Dr+Largo',
  website: 'https://arkanebeer.com/',
  tapsUrl: 'https://arkanebeer.com/tap-list',
  calendarUrl: 'https://www.arkanebeer.com/food-trucks/',
  instagram: 'https://www.instagram.com/arkane_aleworks/',
  hours: { 0: ['13:00', '22:00'], 1: null, 2: null, 3: ['15:00', '22:00'], 4: ['15:00', '22:00'], 5: ['15:00', '22:00'], 6: ['13:00', '22:00'] },
  sources: [noteOnly('Tap list', 'Arkane’s website lists its cans and bottles to go, not what’s on tap. Known for sours.')],
};

const rapp: BreweryDef = {
  id: 'rapp',
  name: 'Rapp Brewing Co.',
  shortName: 'Rapp',
  area: 'Seminole',
  address: '10930 Endeavour Way, Seminole',
  mapsUrl: 'https://maps.google.com/?q=Rapp+Brewing+10930+Endeavour+Way+Seminole',
  website: 'https://www.rappbrewing.com/',
  tapsUrl: 'https://www.rappbrewing.com/now-on-tap.html',
  calendarUrl: 'https://www.rappbrewing.com/food-truck-schedule.html',
  hoursNote: 'Closed Mondays',
  sources: [
    { name: 'Tap list', run: () => untappdTaps(17330, 65145, 'rapp-untappd.js', { ignore: /food|merch/i, house: /rapp/i }) },
    {
      name: 'Food trucks',
      async run(ctx) {
        const ics = await fetchText(googleIcsUrl('125cc2de45f8c4d25d02845730dbfe34e549e8609c55950949d6f16260b187a7@group.calendar.google.com'), {
          fixture: 'rapp.ics',
        });
        const items: Item[] = expandIcs(ics, ctx.windowStart, ctx.windowEnd)
          .filter((o) => !PRIVATE.test(o.title) && !/closed/i.test(o.title))
          .map((o) =>
            /meeting|guild|trivia|music|bingo|club|class|yoga|tournament/i.test(o.title)
              ? fromIcs(o, 'event', o.title.trim())
              : fromIcs(o, 'food', tidyCase(o.title.trim())),
          );
        return { items };
      },
    },
  ],
};

const anecdote: BreweryDef = {
  id: 'anecdote',
  name: 'Anecdote Brewing Co.',
  shortName: 'Anecdote',
  area: 'Indian Rocks Beach',
  address: '321 Gulf Blvd, Indian Rocks Beach',
  mapsUrl: 'https://maps.google.com/?q=Anecdote+Brewing+321+Gulf+Blvd+Indian+Rocks+Beach',
  website: 'https://www.anecdotebrewing.com/',
  tapsUrl: 'https://www.anecdotebrewing.com/beer',
  calendarUrl: 'https://www.anecdotebrewing.com/events',
  hours: { 0: ['11:00', '21:00'], 1: ['13:00', '22:00'], 2: ['13:00', '22:00'], 3: ['13:00', '22:00'], 4: ['13:00', '22:00'], 5: ['12:00', '23:00'], 6: ['11:00', '23:00'] },
  sources: [noteOnly('Tap list', 'Anecdote’s beer list only loads in a browser, so it isn’t shown here.')],
};

export const BREWERIES: BreweryDef[] = [
  brighterDays,
  twoFrogs,
  unrefined,
  deBine,
  stiltHouse,
  crookedThumb,
  southernLights,
  grindhaus,
  threeDaughtersBeach,
  arkane,
  rapp,
  anecdote,
];
