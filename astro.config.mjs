import { defineConfig } from 'astro/config';

process.env.TZ ||= 'America/New_York';

// Some Windows PCs block the compiled helper files Astro normally uses (see scripts/astro.mjs).
// The CSS minifier has no WebAssembly version, so if it's blocked the CSS just isn't minified.
const noCssMinify = process.env.GUIDE_NO_CSS_MINIFY === '1';

export default defineConfig({
  site: 'https://pourguide.beer',
  output: 'static',
  trailingSlash: 'ignore',
  vite: noCssMinify ? { build: { cssMinify: false } } : {},
});
