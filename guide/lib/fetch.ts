import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { LOCATION, LOC_DIR, LOC_ID } from './location';

const FIXTURES = path.join(LOC_DIR, 'fixtures');
const CACHE = path.join(process.cwd(), '.cache', 'sources', LOC_ID);

export const useFixtures = process.env.GUIDE_FIXTURES === '1';
/** GUIDE_RECORD=1 saves every live response into ./fixtures, for later offline builds. */
const recordFixtures = process.env.GUIDE_RECORD === '1';

export async function recordFixture(name: string, body: string): Promise<void> {
  if (!recordFixtures || name === 'unused') return;
  await mkdir(FIXTURES, { recursive: true });
  await writeFile(path.join(FIXTURES, name), body);
}

/** Identify ourselves honestly so brewery webmasters know who's calling. */
const USER_AGENT = `pourguide.beer-aggregator/1.0 (+${LOCATION.url})`;
const TIMEOUT_MS = 15_000;

interface FetchOpts {
  /** Fixture filename under loc/<id>/fixtures, used when GUIDE_FIXTURES=1. */
  fixture: string;
  /** Check the site's robots.txt before fetching (for HTML pages we scrape). */
  respectRobots?: boolean;
}

export class RobotsDisallowed extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export async function fetchText(url: string, opts: FetchOpts & { init?: RequestInit }): Promise<string> {
  if (useFixtures) {
    return readFile(path.join(FIXTURES, opts.fixture), 'utf8');
  }
  if (opts.respectRobots && !(await robotsAllows(url))) {
    throw new RobotsDisallowed(url);
  }
  // One retry for "slow down" answers: several breweries share hosts (WordPress.com, Wix).
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...opts.init,
        signal: ctrl.signal,
        headers: { 'user-agent': USER_AGENT, accept: '*/*', ...(opts.init?.headers as Record<string, string>) },
        redirect: 'follow',
      });
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const body = await res.text();
      await recordFixture(opts.fixture, body);
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function fetchJson<T = any>(url: string, opts: FetchOpts & { init?: RequestInit }): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------- robots.txt

const robotsCache = new Map<string, Promise<string>>();

/**
 * Minimal robots.txt check: honours Disallow/Allow in the "*" group and any
 * group naming pourguide.beer. Longest match wins, as in RFC 9309.
 */
export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  let txtP = robotsCache.get(u.origin);
  if (!txtP) {
    txtP = fetch(`${u.origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT } })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
    robotsCache.set(u.origin, txtP);
  }
  const txt = await txtP;
  const rules = parseRobots(txt);
  const target = u.pathname + u.search;
  let best: { allow: boolean; len: number } = { allow: true, len: -1 };
  for (const r of rules) {
    if (r.path && target.startsWith(r.path) && r.path.length > best.len) {
      best = { allow: r.allow, len: r.path.length };
    }
  }
  return best.allow;
}

function parseRobots(txt: string): { allow: boolean; path: string }[] {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow' || key === 'allow') {
        cur.rules.push({ allow: key === 'allow', path: val });
      }
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.includes('pourguide.beer')));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  // An empty "Disallow:" means "allow everything", so it contributes no rule.
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '');
}

// ------------------------------------------------------------- last-good cache

export async function saveLastGood(key: string, data: unknown) {
  if (useFixtures) return;
  await mkdir(CACHE, { recursive: true });
  await writeFile(path.join(CACHE, `${key}.json`), JSON.stringify({ savedAt: new Date().toISOString(), data }));
}

export async function loadLastGood<T>(key: string): Promise<{ savedAt: string; data: T } | null> {
  const file = path.join(CACHE, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}
