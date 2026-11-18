import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { BREWERIES } from '@loc/breweries';
import { inWindow, type Ctx } from './kit';
import { LOCATION, LOC_DIR, LOC_ID } from './location';
import { loadLastGood, saveLastGood, useFixtures, RobotsDisallowed } from './fetch';
import { addDays, dayKey, fromLocal, itemDayKey, startOfDay } from './time';
import { colorFor, isNonAlcoholic, isNotBeer } from './srm';
import { styleFamily } from './styles';
import type { Beer, BreweryData, Item, SiteData, SourceResult, SourceStatus, ToGoItem } from './types';

/** How far ahead to collect. The page shows today / this weekend / next 7 days. */
const DAYS_AHEAD = 9;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Tap categories that mean packaged beer, not draft. */
const PACKAGED = /\b(to[\s-]?go|packaged|retail|bottles?|cans?|[46][\s-]?packs?|crowlers?)\b/i;

interface ManualEntry {
  tapsNote?: string;
  taps?: Beer[];
  items?: { kind: Item['kind']; title: string; date: string; start?: string; end?: string; url?: string; description?: string }[];
  recurring?: {
    kind: Item['kind'];
    title: string;
    weekday: string;
    /** Only these weeks of the month: 1–5, or -1 for the last. Leave out for every week. */
    weeks?: number[];
    start?: string;
    end?: string;
    from?: string;
    until?: string;
    url?: string;
  }[];
  hide?: string[];
}

let cached: Promise<SiteData> | null = null;

/** Fetch everything once per build; every page shares the result. */
export function getSiteData(): Promise<SiteData> {
  cached ??= build();
  return cached;
}

async function build(): Promise<SiteData> {
  // In fixture mode, pin "now" to the day the fixtures were captured.
  const now = useFixtures ? new Date(process.env.GUIDE_NOW || LOCATION.fixturesNow) : new Date();
  const today = dayKey(now);
  const ctx: Ctx = { windowStart: startOfDay(today), windowEnd: startOfDay(addDays(today, DAYS_AHEAD)) };
  const manual = await loadManual();

  const breweries = await Promise.all(
    BREWERIES.map(async ({ sources, ...brewery }) => {
      const results = await Promise.all(sources.map((s) => runSource(brewery.id, s.name, () => s.run(ctx))));
      const statuses = results.map((r) => r.status);
      let taps: Beer[] = results.flatMap((r) => r.data?.taps ?? []);
      let tapsNote = results.map((r) => r.data?.tapsNote).filter(Boolean).join(' ') || undefined;
      const toGo: ToGoItem[] = results.flatMap((r) => r.data?.toGo ?? []);
      let items: Item[] = results.flatMap((r) => r.data?.items ?? []);

      const m = manual[brewery.id];
      if (m) {
        if (m.taps?.length) {
          taps = m.taps.map((b) => ({ ...b, notBeer: b.notBeer ?? isNotBeer(b.style, b.name), color: b.color ?? colorFor(b.style, b.name) }));
        }
        if (m.tapsNote) tapsNote = m.tapsNote;
        items.push(...manualItems(m, ctx));
        if (m.hide?.length) {
          const res = m.hide.map((h) => new RegExp(h, 'i'));
          items = items.filter((it) => !res.some((re) => re.test(it.title)));
        }
      }

      // The tap list is what's pouring. Anything an adapter tagged as packaged (cans, bottles,
      // "to go") moves to the to-go list instead, so it can't inflate the tap count.
      const packaged = taps.filter((t) => PACKAGED.test(t.category ?? ''));
      taps = taps.filter((t) => !packaged.includes(t));
      toGo.push(...packaged.map((t) => ({ name: t.name, style: t.style, size: t.category })));

      const data: BreweryData = {
        ...brewery,
        taps: dedupeTaps(taps).map((t) => ({ ...t, na: t.na ?? isNonAlcoholic(t), family: t.family ?? styleFamily(t) })),
        tapsNote,
        toGo: toGo.length ? toGo : undefined,
        items: dedupeItems(inWindow(items, ctx)).sort(byStart),
        sources: statuses,
      };
      return data;
    }),
  );

  return {
    generatedAt: now.toISOString(),
    windowStart: ctx.windowStart.toISOString(),
    windowEnd: ctx.windowEnd.toISOString(),
    breweries,
  };
}

async function runSource(
  breweryId: string,
  name: string,
  fn: () => Promise<SourceResult>,
): Promise<{ data?: SourceResult; status: SourceStatus }> {
  const key = `${breweryId}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  try {
    const data = await fn();
    await saveLastGood(key, data);
    return { data, status: { name, ok: true, fetchedAt: new Date().toISOString() } };
  } catch (err) {
    const error = err instanceof RobotsDisallowed ? 'Blocked by the site’s robots.txt' : (err as Error).message;
    console.warn(`[${LOC_ID}] ${breweryId} / ${name}: ${error}`);
    const last = await loadLastGood<SourceResult>(key);
    if (last) {
      return { data: last.data, status: { name, ok: false, stale: true, fetchedAt: last.savedAt, error } };
    }
    return { status: { name, ok: false, error } };
  }
}

async function loadManual(): Promise<Record<string, ManualEntry>> {
  try {
    const text = await readFile(path.join(LOC_DIR, 'manual.yaml'), 'utf8');
    return (parseYaml(text) as Record<string, ManualEntry>) ?? {};
  } catch (err) {
    console.warn(`[${LOC_ID}] Could not read loc/${LOC_ID}/manual.yaml:`, (err as Error).message);
    return {};
  }
}

function manualItems(m: ManualEntry, ctx: Ctx): Item[] {
  const out: Item[] = [];
  const mk = (date: string, x: { kind: Item['kind']; title: string; start?: string; end?: string; url?: string; description?: string }): Item =>
    x.start
      ? {
          kind: x.kind,
          title: x.title,
          start: fromLocal(`${date}T${x.start}`).toISOString(),
          end: x.end ? fromLocal(`${date}T${x.end}`).toISOString() : undefined,
          allDay: false,
          url: x.url,
          description: x.description,
        }
      : { kind: x.kind, title: x.title, start: date, allDay: true, url: x.url, description: x.description };

  for (const it of m.items ?? []) out.push(mk(String(it.date), it));

  const first = dayKey(ctx.windowStart);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = addDays(first, i);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    for (const r of m.recurring ?? []) {
      if (WEEKDAYS.indexOf(r.weekday.slice(0, 3).toLowerCase()) !== dow) continue;
      if (r.from && day < String(r.from)) continue;
      if (r.until && day > String(r.until)) continue;
      if (r.weeks?.length) {
        const dom = Number(day.slice(8, 10));
        const isLast = Number(addDays(day, 7).slice(5, 7)) !== Number(day.slice(5, 7));
        if (!r.weeks.some((w) => (w === -1 ? isLast : Math.ceil(dom / 7) === w))) continue;
      }
      out.push(mk(day, r));
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Same title on the same day counts once (calendar + manual overlap, or two scrapers). */
function dedupeItems(items: Item[]): Item[] {
  const seen = new Map<string, Item>();
  for (const it of items) {
    const k = `${it.kind}|${itemDayKey(it)}|${norm(it.title)}`;
    // Prefer timed entries over all-day ones.
    const prev = seen.get(k);
    if (!prev || (prev.allDay && !it.allDay)) seen.set(k, it);
  }
  // Fuzzy pass: "Trivia" (manual) vs "Trivia Night" (calendar) on the same day.
  const list = [...seen.values()];
  return list.filter(
    (a) =>
      !list.some(
        (b) => b !== a && b.kind === a.kind && itemDayKey(a) === itemDayKey(b) && norm(b.title).length > norm(a.title).length && norm(b.title).includes(norm(a.title)),
      ),
  );
}

function dedupeTaps(taps: Beer[]): Beer[] {
  const seen = new Set<string>();
  return taps.filter((b) => {
    const k = norm(b.name) + '|' + norm(b.style || '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function byStart(a: Item, b: Item): number {
  const ka = a.allDay ? `${a.start}T00` : `${itemDayKey(a)}T${a.start}`;
  const kb = b.allDay ? `${b.start}T00` : `${itemDayKey(b)}T${b.start}`;
  return ka.localeCompare(kb);
}
