import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface Guide {
  id: string;
  name: string;
  region?: string;
  url: string;
  status: 'live' | 'soon';
  host: string;
  /** From the guide's data.json, when it could be read. */
  stats?: {
    breweries: string[];
    beers: number;
    /** Beer colors, light to dark, for the row of glasses. */
    colors: string[];
  };
}

const useFixtures = process.env.POURGUIDE_FIXTURES === '1';

/** Reads src/data/guides.yaml and, for live guides, each guide's data.json. */
export async function loadGuides(): Promise<Guide[]> {
  const raw = parseYaml(await readFile(path.join(process.cwd(), 'src/data/guides.yaml'), 'utf8')) ?? {};
  const list: any[] = Array.isArray(raw.guides) ? raw.guides : [];
  return Promise.all(
    list.map(async (g) => {
      const url = String(g.url ?? '').replace(/\/$/, '');
      const guide: Guide = {
        id: String(g.id),
        name: String(g.name ?? g.id),
        region: g.region ? String(g.region) : undefined,
        url,
        status: g.status === 'soon' ? 'soon' : 'live',
        host: url.replace(/^https?:\/\//, ''),
      };
      if (guide.status === 'live') guide.stats = await readStats(guide.id, g.data ? String(g.data) : `${url}/data.json`);
      return guide;
    }),
  );
}

async function readStats(id: string, dataUrl: string): Promise<Guide['stats']> {
  let data: any;
  try {
    if (useFixtures) {
      data = JSON.parse(await readFile(path.join(process.cwd(), 'fixtures', `${id}-data.json`), 'utf8'));
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(dataUrl, { signal: ctrl.signal, headers: { 'user-agent': 'pourguide.beer/1.0 (+https://pourguide.beer)' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
  } catch (err) {
    // The page still builds; this guide just shows without numbers.
    console.warn(`[pourguide] Couldn't read ${dataUrl}: ${(err as Error).message}`);
    return undefined;
  }
  const breweries: any[] = Array.isArray(data?.breweries) ? data.breweries : [];
  const beers = breweries.flatMap((b) => (Array.isArray(b.taps) ? b.taps : [])).filter((t) => !t.notBeer && t.color);
  return {
    breweries: breweries.map((b) => String(b.shortName ?? b.name)),
    beers: beers.length,
    colors: sample(
      beers.map((t) => String(t.color)).sort((a, b) => lightness(b) - lightness(a)),
      48,
    ),
  };
}

/** Relative lightness of a #rrggbb color, for sorting pale to dark. */
function lightness(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** At most n items, picked evenly across the list so the light-to-dark spread survives. */
function sample<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}
