// Runs Astro for one site in this repo: the front page or one location.
//
//   node scripts/astro.mjs dev jax            jax guide, live data, http://localhost:4321
//   node scripts/astro.mjs dev jax --fixtures same, from loc/jax/fixtures
//   node scripts/astro.mjs dev index          the pourguide.beer front page
//
// `npm run build` builds everything through scripts/build-all.mjs, which calls this.
//
// Astro uses a few compiled helper files (.node). Some Windows PCs have an
// Application Control / Smart App Control policy that blocks them, which shows up as
// "Cannot find native binding ... An Application Control policy has blocked this file".
//
// This script tries to load those helpers first. For each one that's blocked, it installs
// the WebAssembly version of that helper (only on this computer, nothing is saved to
// package.json). The helper then switches to it by itself; the ones that load normally are
// left alone. The site comes out the same. If the CSS minifier is blocked, CSS just isn't
// minified. GitHub's build server isn't affected.
//
// GUIDE_HELPERS=native skips the check. GUIDE_HELPERS=wasm uses WebAssembly for everything.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const nm = join(root, 'node_modules');
const astroArgs = process.argv.slice(2);

// `--fixtures` builds from the saved sample data instead of fetching (works on Windows too).
const fixturesAt = astroArgs.indexOf('--fixtures');
if (fixturesAt !== -1) {
  astroArgs.splice(fixturesAt, 1);
  process.env.GUIDE_FIXTURES = '1';
}

// Which site: "index", or a location id with a loc/<id>/ folder. Defaults to the front page.
const targetAt = astroArgs.findIndex((a, i) => i > 0 && !a.startsWith('-') && (a === 'index' || existsSync(join(root, 'loc', a, 'location.json'))));
if (targetAt !== -1) {
  process.env.GUIDE_TARGET = astroArgs[targetAt];
  astroArgs.splice(targetAt, 1);
} else if (astroArgs[1] && !astroArgs[1].startsWith('-')) {
  console.error(`No location "${astroArgs[1]}". Use "index" or a folder name from loc/.`);
  process.exit(1);
}
process.env.GUIDE_TARGET ||= 'index';

// Packages whose compiled helper has a WebAssembly twin, and the folder prefix
// their compiled helper is installed under.
const PARENTS = [
  { pkg: 'rolldown', native: '@rolldown/binding-' },
  { pkg: '@astrojs/compiler-binding', native: '@astrojs/compiler-binding-' },
  { pkg: 'satteri', native: '@bruits/satteri-' },
];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Every .node file sitting at the top of a package folder in node_modules.
function nativeFiles() {
  const out = [];
  const visit = (dir) => {
    for (const f of readdirSync(dir)) if (f.endsWith('.node')) out.push(join(dir, f));
  };
  for (const name of readdirSync(nm)) {
    const p = join(nm, name);
    if (name.startsWith('@')) {
      for (const sub of readdirSync(p)) {
        visit(join(p, sub));
      }
    } else if (/(-win32-|-darwin-|-linux-)/.test(name)) {
      visit(p);
    }
  }
  // Only this computer's own platform (npm may also have unpacked others).
  const isMusl = process.platform === 'linux' && !process.report?.getReport().header.glibcVersionRuntime;
  return out.filter((f) => {
    const n = f.slice(nm.length + 1).replaceAll('\\', '/');
    if (!n.includes(`${process.platform}-${process.arch}`)) return false;
    if (process.platform === 'linux' && n.includes('musl') !== isMusl) return false;
    return true;
  });
}

function blockedFiles() {
  const blocked = [];
  for (const file of nativeFiles()) {
    try {
      process.dlopen({ exports: {} }, file);
    } catch (err) {
      blocked.push({ file, why: String(err.message).split('\n')[0] });
    }
  }
  return blocked;
}

function wasmPackages(parents) {
  const wanted = [];
  for (const { pkg: parent } of parents) {
    const pkgFile = join(nm, parent, 'package.json');
    if (!existsSync(pkgFile)) continue;
    const opt = readJson(pkgFile).optionalDependencies ?? {};
    for (const [name, version] of Object.entries(opt)) {
      if (name.endsWith('wasm32-wasi')) wanted.push({ name, version });
    }
  }
  return wanted;
}

function installedVersion(name) {
  const f = join(nm, name, 'package.json');
  return existsSync(f) ? readJson(f).version : undefined;
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: false });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

if (!existsSync(nm)) {
  console.error('node_modules is missing. Run `npm install` first.');
  process.exit(1);
}

const env = { ...process.env };
const mode = process.env.GUIDE_HELPERS;
let needed = []; // helpers that need their WebAssembly version

if (mode === 'wasm') {
  needed = PARENTS;
  env.NAPI_RS_FORCE_WASI = 'true';
  env.GUIDE_NO_CSS_MINIFY = '1';
} else if (mode !== 'native') {
  const blocked = blockedFiles();
  if (blocked.length) {
    const rel = (b) => b.file.slice(nm.length + 1).replaceAll('\\', '/');
    console.log("\nThis PC blocked some of Astro's compiled helpers:");
    for (const b of blocked) console.log(`  - ${rel(b)}`);
    needed = PARENTS.filter((p) => blocked.some((b) => rel(b).startsWith(p.native)));
    if (blocked.some((b) => rel(b).startsWith('lightningcss-'))) env.GUIDE_NO_CSS_MINIFY = '1';
    console.log('Using WebAssembly versions of those instead. Same result.\n');
  }
}

if (needed.length) {
  const missing = wasmPackages(needed).filter((p) => installedVersion(p.name) !== p.version);
  if (missing.length) {
    const specs = missing.map((p) => `${p.name}@${p.version}`);
    console.log(`Installing (this computer only): ${specs.join(', ')}\n`);
    // --force is needed because these packages are marked for the "wasm32" CPU.
    // --no-save keeps package.json and package-lock.json unchanged.
    const args = ['install', '--no-save', '--force', '--no-audit', '--no-fund', '--loglevel=error', ...specs];
    const npmCli = process.env.npm_execpath;
    const status = npmCli
      ? run(process.execPath, [npmCli, ...args], env)
      : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, env);
    if (status !== 0) process.exit(status);
  }
  env.NODE_NO_WARNINGS = '1'; // hides Node's "WASI is experimental" notice
}

const astroBin = join(nm, 'astro', 'bin', 'astro.mjs');
process.exit(run(process.execPath, [astroBin, ...astroArgs], env));
