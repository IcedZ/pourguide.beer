import type { Beer, Item } from '@guide/lib/types';
import { fetchJson, fetchText } from '@guide/lib/fetch';
import { parseSqsCollection, parseSqsUserItems } from '@guide/lib/parsers/squarespace';
import { cheerio, parseAbv, tidyCase } from '@guide/lib/parsers/html';
import { fetchIMenuPro } from '@guide/lib/parsers/imenupro';
import { fetchBentoEvents } from '@guide/lib/parsers/bentobox';
import { addDays, dayKey, fromLocal } from '@guide/lib/time';
import { beer, inWindow, noteOnly, PRIVATE, type BreweryDef, type Ctx } from '@guide/lib/kit';

// The breweries on Florida's Historic Coast "Craft Beverages" list
// (floridashistoriccoast.com/food-drink/craft-beverages/), November 2026.
// The distilleries and winery on that list get a short mention in location.json instead.

const bog: BreweryDef = {
  id: 'bog',
  name: 'The Bog Brewing Company',
  shortName: 'The Bog',
  area: 'West King Street',
  address: '218 W King St, St. Augustine',
  mapsUrl: 'https://maps.google.com/?q=The+Bog+Brewing+Company+St.+Augustine',
  website: 'https://www.drinkbogbeer.com/',
  tapsUrl: 'https://www.drinkbogbeer.com/on-tap',
  calendarUrl: 'https://www.drinkbogbeer.com/events',
  instagram: 'https://www.instagram.com/bogbrewing/',
  hours: { 0: ['11:30', '22:00'], 1: ['11:30', '22:00'], 2: ['11:30', '22:00'], 3: ['11:30', '22:00'], 4: ['11:30', '00:00'], 5: ['11:30', '00:00'], 6: ['11:30', '00:00'] },
  kitchen: { name: 'Tacos My Blessing', menuUrl: 'https://www.drinkbogbeer.com/tacos-my-blessing' },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // Squarespace list sections, one per group ("Lagers", "Specialty Beers", "Hoppy"…).
        // Each item's title is "Name • 5.2%".
        const html = await fetchText('https://www.drinkbogbeer.com/on-tap', { fixture: 'bog-on-tap.html', respectRobots: true });
        const taps: Beer[] = [];
        for (const it of parseSqsUserItems(html)) {
          const m = it.title.match(/^(.*?)\s*[•·|]\s*(\d+(?:\.\d+)?)\s*%/);
          const name = (m ? m[1] : it.title).trim();
          if (!name) continue;
          const group = it.section ? tidyCase(it.section) : undefined;
          const notBeer = /cider|wine|prosecco|soda|seltzer|kombucha|non-?alc/i.test(`${name} ${group ?? ''}`) ? true : undefined;
          taps.push(beer({ name, style: styleFromName(name), abv: m ? Number(m[2]) : undefined, description: it.description, category: group, notBeer }));
        }
        return { taps };
      },
    },
    {
      name: 'Events',
      async run(ctx) {
        const json = await fetchJson('https://www.drinkbogbeer.com/events?format=json', { fixture: 'bog-events.json' });
        const items: Item[] = parseSqsCollection(json, 'https://www.drinkbogbeer.com')
          .filter((e) => !PRIVATE.test(e.title))
          .map((e) => ({
            kind: /food\s*truck/i.test(e.title) ? 'food' : 'event',
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
  ],
};

/** "House Pilsner" → "Pilsner", "Float Away IPA" → "IPA". For lists that only give a name. */
function styleFromName(name: string): string | undefined {
  const m = name.match(
    /\b(Hazy IPA|West Coast IPA|Double IPA|IPA|Pilsner|Helles|Lager|Kolsch|Kölsch|Hefeweizen|Witbier|Wheat|Cream Ale|Pale Ale|Amber|Red Ale|Brown Ale|Porter|Stout|Sour|Gose|Saison|Tripel|Dubbel|Bock|Marzen|Märzen|Oktoberfest|ESB|Barleywine|Blonde)\b/i,
  );
  return m ? tidyCase(m[1]) : undefined;
}

const bootlegger: BreweryDef = {
  id: 'bootlegger-beach',
  name: 'Bootlegger Beach Brewing at Jack’s Bar-B-Que',
  shortName: 'Bootlegger Beach',
  area: 'St. Augustine Beach',
  address: '691 A1A Beach Blvd, St. Augustine Beach',
  mapsUrl: 'https://maps.google.com/?q=Jacks+Bar-B-Que+691+A1A+Beach+Blvd+St+Augustine+Beach',
  website: 'https://www.instagram.com/jacksbbqandbrewery',
  instagram: 'https://www.instagram.com/jacksbbqandbrewery',
  hours: { 0: ['11:00', '02:00'], 1: ['11:00', '02:00'], 2: ['11:00', '02:00'], 3: ['11:00', '02:00'], 4: ['11:00', '02:00'], 5: ['11:00', '02:00'], 6: ['11:00', '02:00'] },
  hoursNote: 'Jack’s Bar-B-Que hours; the brewery is next door',
  kitchen: { name: 'Jack’s Bar-B-Que' },
  // No website; taps and events are on Instagram.
  sources: [noteOnly('Tap list', 'Bootlegger Beach posts its beers on Instagram only.')],
};

const dogRose: BreweryDef = {
  id: 'dog-rose',
  name: 'Dog Rose Brewing Co.',
  shortName: 'Dog Rose',
  area: 'Lincolnville',
  address: '77 Bridge St, St. Augustine',
  mapsUrl: 'https://maps.google.com/?q=Dog+Rose+Brewing+Co+St.+Augustine',
  website: 'https://www.dogrosebrewing.com/',
  tapsUrl: 'https://www.dogrosebrewing.com/menus/',
  calendarUrl: 'https://www.dogrosebrewing.com/events/',
  instagram: 'https://www.instagram.com/dogrosebrewing/',
  hours: { 0: ['12:00', '22:00'], 1: ['12:00', '22:00'], 2: ['12:00', '22:00'], 3: ['12:00', '22:00'], 4: ['12:00', '22:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [
    // The beer menu on /menus/ is a picture.
    noteOnly('Tap list', 'Dog Rose posts its beer menu as an image on its website.'),
    {
      name: 'Events',
      async run(ctx) {
        // BentoBox: one page per event. Dated ones are read here; the weekly ones
        // (Sunday music, Friday/Sunday pizza) are in loc/staug/manual.yaml.
        const events = await fetchBentoEvents('https://www.dogrosebrewing.com', 'dr');
        const items: Item[] = events
          .filter((e) => !PRIVATE.test(e.title))
          .map((e) => ({
            kind: /food\s*truck|hot\s*dog|pizza|cart\b|tacos?\b|bbq|wings?\b/i.test(e.title) ? 'food' : 'event',
            title: e.title.replace(/\s+food truck$/i, ''),
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

const hornskis: BreweryDef = {
  id: 'hornskis',
  name: 'Hornski’s Brewing Co.',
  shortName: 'Hornski’s',
  area: 'Anastasia Island',
  address: '100 Anastasia Blvd, St. Augustine',
  mapsUrl: 'https://maps.google.com/?q=Hornskis+Brewing+Co+St.+Augustine',
  website: 'https://www.hornskis.com/',
  tapsUrl: 'https://www.hornskis.com/menu',
  instagram: 'https://www.instagram.com/hornskisbrewing/',
  hours: { 0: ['12:00', '22:00'], 1: ['12:00', '23:00'], 2: ['12:00', '23:00'], 3: ['12:00', '23:00'], 4: ['12:00', '00:00'], 5: ['12:00', '00:00'], 6: ['12:00', '00:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        const html = await fetchText('https://www.hornskis.com/menu', { fixture: 'hk-menu.html', respectRobots: true });
        return parseHornskis(html);
      },
    },
  ],
};

/**
 * Squarespace text blocks, in order: "OUR BEER", then for each beer an h3 name and
 * paragraphs with "STYLE 5.6%" and a description. "GUEST DRAUGHTS" names are
 * "Brewery - Beer". "WINE" and "CANS & BOTTLES" follow and are only counted.
 */
function parseHornskis(html: string) {
  const $ = cheerio.load(html);
  const blocks: { tag: string; text: string }[] = [];
  $('.sqs-html-content')
    .find('h1, h2, h3, h4, p')
    .each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ tag: el.tagName.toLowerCase(), text });
    });

  type Section = 'none' | 'house' | 'guest' | 'wine' | 'cans';
  let section: Section = 'none';
  const taps: Beer[] = [];
  let wine = false;
  let cans = 0;
  let cur: { name: string; lines: string[] } | undefined;

  const flush = () => {
    if (!cur) return;
    const spec = cur.lines.map((l) => l.match(/^(.*?)\s+(\d+(?:\.\d+)?%|NA)$/i)).find(Boolean);
    const description = cur.lines.find((l) => !/^(.*?)\s+(\d+(?:\.\d+)?%|NA)$/i.test(l));
    const [brewery, beerName] = section === 'guest' && / - /.test(cur.name) ? cur.name.split(/\s+-\s+/, 2) : [undefined, cur.name];
    const style = spec?.[1] ? tidyCase(spec[1]) : undefined;
    const na = spec?.[2]?.toUpperCase() === 'NA';
    taps.push(
      beer({
        name: brewery ? `${beerName} (${brewery})` : beerName,
        style,
        abv: na ? 0 : spec?.[2] ? parseAbv(spec[2]) : undefined,
        description,
        category: section === 'guest' ? 'Guest' : undefined,
        notBeer: /cider|kombucha|seltzer/i.test(style ?? '') ? true : undefined,
      }),
    );
    cur = undefined;
  };

  for (const b of blocks) {
    if (b.tag === 'h2' && /our beer/i.test(b.text)) {
      section = 'house';
      continue;
    }
    if (b.tag === 'h3' && /^guest draughts?$/i.test(b.text)) {
      flush();
      section = 'guest';
      continue;
    }
    if (b.tag === 'h3' && /^wine$/i.test(b.text)) {
      flush();
      section = 'wine';
      continue;
    }
    if (b.tag === 'h3' && /^cans\s*&\s*bottles$/i.test(b.text)) {
      flush();
      section = 'cans';
      continue;
    }
    if (section === 'house' || section === 'guest') {
      if (b.tag === 'h3') {
        flush();
        cur = { name: tidyCase(b.text), lines: [] };
      } else if (cur) {
        cur.lines.push(b.text);
      }
    } else if (section === 'wine') {
      wine = true;
    } else if (section === 'cans' && b.tag === 'h3') {
      cans++;
    }
  }
  flush();
  const extras = [wine && 'wine', cans && `${cans} cans and bottles from other brewers`].filter(Boolean);
  return { taps, tapsNote: extras.length ? `Plus ${extras.join(' and ')}.` : undefined };
}

const oldCoast: BreweryDef = {
  id: 'old-coast',
  name: 'Old Coast Ales',
  shortName: 'Old Coast Ales',
  area: 'Anastasia Island',
  address: '300 Anastasia Blvd, St. Augustine',
  mapsUrl: 'https://maps.google.com/?q=Old+Coast+Ales+St.+Augustine',
  website: 'https://www.oldcoastales.com/',
  tapsUrl: 'https://www.oldcoastales.com/',
  calendarUrl: 'https://www.oldcoastales.com/',
  instagram: 'https://www.instagram.com/oldcoastales/',
  hours: { 0: ['11:30', '22:00'], 1: ['11:30', '22:00'], 2: ['11:30', '22:00'], 3: ['11:30', '22:00'], 4: ['11:30', '22:00'], 5: ['11:30', '23:00'], 6: ['11:30', '23:00'] },
  sources: [
    {
      name: 'Tap list',
      async run() {
        // iMenuPro menu ("1lpg-5") embedded on the home page. Extras end with "5.2% abv".
        const items = await fetchIMenuPro('1lpg-5', 'oca-imenupro.js');
        const taps = items.map((i) =>
          beer({
            name: i.name,
            style: i.description,
            abv: i.extras ? parseAbv(i.extras) : undefined,
            description: i.extras?.replace(/\s*\d+(?:\.\d+)?\s*%\s*abv\s*$/i, '').trim() || undefined,
            category: i.section ? tidyCase(i.section) : undefined,
          }),
        );
        return { taps };
      },
    },
    {
      name: 'Live music',
      async run(ctx) {
        // "MUSIC LINE-UP" on the home page: "WEDNESDAY Sept. 9th 6-9 pm kirk whalen".
        // Music is every Wednesday 6–9; weeks without a name in the line-up get a plain entry.
        const html = await fetchText('https://www.oldcoastales.com/', { fixture: 'oca-home.html', respectRobots: true });
        return { items: inWindow(parseOldCoastMusic(html, ctx), ctx) };
      },
    },
  ],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseOldCoastMusic(html: string, ctx: Ctx): Item[] {
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');
  const lineup = text.slice(text.search(/MUSIC LINE-UP/i));
  const today = dayKey(ctx.windowStart);
  const items: Item[] = [];
  const re = /(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+([A-Za-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2})\s*-\s*(\d{1,2})\s*pm\s+(.+?)(?=\s+(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b|\s+ABOUT US|$)/gi;
  for (const m of lineup.matchAll(re)) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month < 0) continue;
    let year = Number(today.slice(0, 4));
    const key = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (key(year) < addDays(today, -180)) year += 1;
    const day = key(year);
    const start = Number(m[4]) + 12;
    const end = Number(m[5]) + 12;
    items.push({
      kind: 'event',
      title: `Live music: ${tidyCase(m[6].trim())}`,
      start: fromLocal(`${day}T${String(start).padStart(2, '0')}:00`).toISOString(),
      end: fromLocal(`${day}T${String(end).padStart(2, '0')}:00`).toISOString(),
      allDay: false,
      url: 'https://www.oldcoastales.com/',
    });
  }
  // Every Wednesday 6–9 PM, per the home page.
  const named = new Set(items.map((i) => dayKey(new Date(i.start))));
  for (let d = today; d < dayKey(ctx.windowEnd); d = addDays(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 3 || named.has(d)) continue;
    items.push({
      kind: 'event',
      title: 'Live music',
      start: fromLocal(`${d}T18:00`).toISOString(),
      end: fromLocal(`${d}T21:00`).toISOString(),
      allDay: false,
      url: 'https://www.oldcoastales.com/',
    });
  }
  return items;
}

export const BREWERIES: BreweryDef[] = [bog, bootlegger, dogRose, hornskis, oldCoast];
