#!/usr/bin/env node
// Prints which brewery sources worked in the last build, for every location in dist/loc/.
// Exits 1 if any source failed with no cached copy to fall back on.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const locRoot = new URL('../dist/loc/', import.meta.url);
if (!existsSync(locRoot)) {
  console.error('dist/loc/ not found. Run `npm run build` first.');
  process.exit(2);
}

let hardFail = false;
for (const id of readdirSync(locRoot).sort()) {
  const file = new URL(`${id}/data.json`, locRoot);
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n######## loc/${id}`);
  for (const b of data.breweries) {
    const trucks = b.items.filter((i) => i.kind === 'food').length;
    const events = b.items.filter((i) => i.kind === 'event').length;
    console.log(`\n${b.name}  —  ${b.taps.length} taps, ${trucks} food trucks, ${events} events`);
    for (const s of b.sources) {
      const mark = s.ok ? 'ok   ' : s.stale ? 'STALE' : 'FAIL ';
      console.log(`  ${mark} ${s.name}${s.error ? `  (${s.error})` : ''}`);
      if (!s.ok && !s.stale) hardFail = true;
    }
  }
}
process.exit(hardFail ? 1 : 0);
