import type { APIRoute } from 'astro';
import { getSiteData } from '../lib/aggregate';
import { CANONICAL } from '../lib/location';

/** One page per guide; lastmod is when this build gathered the data. */
export const GET: APIRoute = async () => {
  const data = await getSiteData();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${CANONICAL}/</loc>
    <lastmod>${data.generatedAt}</lastmod>
    <changefreq>hourly</changefreq>
  </url>
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
