// One Astro config for every site in this repo. Each build makes one of them:
//   GUIDE_TARGET=index   the pourguide.beer front page   (site/)
//   GUIDE_TARGET=<id>    the city guide for loc/<id>/     (guide/ + loc/<id>/)
// `npm run build` (scripts/build-all.mjs) builds them all and puts them together in dist/.
import { defineConfig } from 'astro/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = process.env.GUIDE_TARGET || 'index';
process.env.GUIDE_TARGET = target;

// Some Windows PCs block the compiled helper files Astro normally uses (see scripts/astro.mjs).
// The CSS minifier has no WebAssembly version, so if it's blocked the CSS just isn't minified.
const noCssMinify = process.env.GUIDE_NO_CSS_MINIFY === '1';

let config;
if (target === 'index') {
  process.env.TZ ||= 'America/New_York';
  config = {
    site: 'https://pourguide.beer',
    srcDir: './site',
    publicDir: './site/public',
    outDir: './.build/index',
  };
} else {
  const locDir = path.join(root, 'loc', target);
  if (!existsSync(path.join(locDir, 'location.json'))) {
    throw new Error(`No location "${target}": loc/${target}/location.json doesn't exist.`);
  }
  const location = JSON.parse(readFileSync(path.join(locDir, 'location.json'), 'utf8'));
  // Every date on the guide is local time for that location, wherever the build runs.
  process.env.TZ = location.timezone;
  config = {
    site: location.url,
    srcDir: './guide',
    publicDir: './guide/public',
    outDir: `./.build/${target}`,
    vite: {
      resolve: { alias: { '@loc': locDir } },
      define: { __GUIDE_TZ__: JSON.stringify(location.timezone) },
    },
  };
}

export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  ...config,
  cacheDir: `./node_modules/.astro/${target}`,
  vite: {
    ...config.vite,
    resolve: { alias: { '@guide': path.join(root, 'guide'), ...config.vite?.resolve?.alias } },
    ...(noCssMinify ? { build: { cssMinify: false } } : {}),
  },
});
