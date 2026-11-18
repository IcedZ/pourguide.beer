import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadGuides } from '../lib/guides';

/**
 * The front page plus every live guide on a pourguide.beer subdomain. Search engines accept
 * the subdomains here once pourguide.beer is verified as a whole domain (Google Search Console
 * "Domain" property). A guide whose main address is elsewhere (gnv → gnv.beer) is left to its
 * own sitemap.
 */
export const GET: APIRoute = async () => {
  const guides = await loadGuides();
  const now = new Date().toISOString();
  const urls = ['https://pourguide.beer/'];
  for (const g of guides) {
    if (g.status !== 'live') continue;
    let canonical = g.url;
    try {
      const loc = JSON.parse(await readFile(path.join(process.cwd(), 'loc', g.id, 'location.json'), 'utf8'));
      if (loc.canonicalUrl) canonical = String(loc.canonicalUrl).replace(/\/$/, '');
    } catch {
      // no location.json (built elsewhere): use the url from locations.yaml
    }
    if (/^https:\/\/[a-z0-9-]+\.pourguide\.beer$/.test(canonical)) urls.push(`${canonical}/`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>hourly</changefreq>\n  </url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
