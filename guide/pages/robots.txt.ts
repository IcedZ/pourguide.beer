import type { APIRoute } from 'astro';
import { CANONICAL } from '../lib/location';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${CANONICAL}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
