// Builds every location in loc/locations.yaml and the pourguide.beer front page,
// then lays them out in dist/ exactly as they go on the server:
//
//   dist/               pourguide.beer
//   dist/loc/<id>/      <id>.pourguide.beer
//
// If a location's build fails, its last good build is used instead (kept in
// .cache/last-good/), so one broken location never takes a working one offline.
// The front page is built last, because it reads each location's data.json.
//
// Usage: node scripts/build-all.mjs [--fixtures] [ids…]   (no ids = every location)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = process.cwd();
const args = process.argv.slice(2);
const fixtures = args.includes('--fixtures');
const only = args.filter((a) => !a.startsWith('--'));

const list = parseYaml(readFileSync(path.join(root, 'loc/locations.yaml'), 'utf8'))?.locations ?? [];
const locations = list
  .filter((l) => l.build !== false && existsSync(path.join(root, 'loc', String(l.id), 'location.json')))
  .map((l) => String(l.id))
  .filter((id) => !only.length || only.includes(id));

const build = (target) => {
  console.log(`\n=== Building ${target === 'index' ? 'pourguide.beer front page' : `loc/${target}`} ===`);
  const r = spawnSync(process.execPath, ['scripts/astro.mjs', 'build', target, ...(fixtures ? ['--fixtures'] : [])], {
    stdio: 'inherit',
    env: process.env,
  });
  return r.status === 0 && existsSync(path.join(root, '.build', target, 'index.html'));
};

const failed = [];
const missing = [];
for (const id of locations) {
  const out = path.join(root, '.build', id);
  const lastGood = path.join(root, '.cache', 'last-good', id);
  if (build(id)) {
    rmSync(lastGood, { recursive: true, force: true });
    cpSync(out, lastGood, { recursive: true });
  } else if (existsSync(path.join(lastGood, 'index.html'))) {
    console.warn(`\n[build-all] loc/${id} failed to build. Using its last good build instead.`);
    rmSync(out, { recursive: true, force: true });
    cpSync(lastGood, out, { recursive: true });
    failed.push(id);
  } else {
    console.warn(`\n[build-all] loc/${id} failed to build and has no earlier build. Leaving it out.`);
    failed.push(id);
    missing.push(id);
  }
}

if (!build('index')) {
  console.error('\n[build-all] The front page failed to build. Stopping, so nothing gets uploaded.');
  process.exit(1);
}

// Put it together.
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, '.build', 'index'), dist, { recursive: true });
for (const id of locations) {
  if (missing.includes(id)) continue;
  mkdirSync(path.join(dist, 'loc'), { recursive: true });
  cpSync(path.join(root, '.build', id), path.join(dist, 'loc', id), { recursive: true });
}

console.log(`\n[build-all] dist/ has the front page and ${locations.length - missing.length} location(s): ${locations.filter((i) => !missing.includes(i)).join(', ')}`);
if (failed.length) console.warn(`[build-all] Failed this time: ${failed.join(', ')}`);
