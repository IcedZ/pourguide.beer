import { fetchText } from '../fetch';
import { cheerio } from './html';
import { fromLocal } from '../time';

/**
 * BentoBox restaurant sites: the events list (`/events/`) links to one page per event,
 * and each event page carries schema.org Event JSON-LD plus a "November 21, 2026 01:00 PM"
 * line. Repeating events ("every Sunday") have no date line and are skipped; put those
 * in manual.yaml.
 */
export interface BentoEvent {
  title: string;
  /** ISO instant. */
  start: string;
  url: string;
  description?: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export async function fetchBentoEvents(origin: string, fixturePrefix: string, limit = 20): Promise<BentoEvent[]> {
  const list = await fetchText(`${origin}/events/`, { fixture: `${fixturePrefix}-events.html`, respectRobots: true });
  const $ = cheerio.load(list);
  const paths = [...new Set($('a[href^="/event/"]').map((_, a) => $(a).attr('href')!).get())].slice(0, limit);
  const out: BentoEvent[] = [];
  for (const p of paths) {
    const slug = p.replace(/^\/event\/|\/$/g, '');
    try {
      const html = await fetchText(`${origin}${p}`, { fixture: `${fixturePrefix}-ev-${slug}.html`, respectRobots: true });
      const ev = parseBentoEvent(html, `${origin}${p}`);
      if (ev) out.push(ev);
    } catch {
      // one broken event page shouldn't sink the rest
    }
  }
  return out;
}

export function parseBentoEvent(html: string, url: string): BentoEvent | undefined {
  const $ = cheerio.load(html);
  let ld: any;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const d = JSON.parse($(s).text());
      if (d?.['@type'] === 'Event') ld = d;
    } catch {
      // ignore
    }
  });
  const main = $('main').text().replace(/\s+/g, ' ');
  const m = main.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return undefined; // repeating event with no date line
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === 'PM') h += 12;
  const day = `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const title = String(ld?.name ?? $('h1').first().text()).replace(/\s+/g, ' ').trim();
  if (!title) return undefined;
  const description = ld?.description ? cheerio.load(`<p>${ld.description}</p>`)('p').text().replace(/\s+/g, ' ').trim() : undefined;
  return { title, start: fromLocal(`${day}T${String(h).padStart(2, '0')}:${m[5]}`).toISOString(), url, description: description || undefined };
}
