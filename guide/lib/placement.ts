import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { LOC_DIR, LOC_ID } from './location';

export interface Placement {
  pinned: string[];
  pinnedLabel: string;
}

/** Reads loc/<id>/placement.yaml. Unknown brewery ids are dropped with a warning. */
export async function loadPlacement(knownIds: string[]): Promise<Placement> {
  let raw: any = {};
  try {
    raw = parseYaml(await readFile(path.join(LOC_DIR, 'placement.yaml'), 'utf8')) ?? {};
  } catch (err) {
    console.warn(`[${LOC_ID}] Could not read loc/${LOC_ID}/placement.yaml:`, (err as Error).message);
  }
  const pinned: string[] = [];
  for (const id of Array.isArray(raw.pinned) ? raw.pinned : []) {
    const s = String(id).trim();
    if (!knownIds.includes(s)) {
      console.warn(`[${LOC_ID}] placement.yaml: "${s}" isn't a brewery id. Known ids: ${knownIds.join(', ')}`);
      continue;
    }
    if (!pinned.includes(s)) pinned.push(s);
  }
  return { pinned, pinnedLabel: typeof raw.pinnedLabel === 'string' ? raw.pinnedLabel : 'Featured' };
}

/** Pinned first (in order), then the rest shuffled. The browser reshuffles the rest on each visit. */
export function orderBreweries<T extends { id: string }>(list: T[], pinned: string[]): T[] {
  const top = pinned.map((id) => list.find((b) => b.id === id)!).filter(Boolean);
  const rest = list.filter((b) => !pinned.includes(b.id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...top, ...rest];
}
