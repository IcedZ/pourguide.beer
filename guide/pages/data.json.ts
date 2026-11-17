import type { APIRoute } from 'astro';
import { getSiteData } from '../lib/aggregate';

/** The whole dataset as JSON, for anyone who wants to build on it. */
export const GET: APIRoute = async () => {
  const data = await getSiteData();
  return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json' } });
};
