import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOC_DIR } from '../lib/location';

/**
 * The share image (1200×630) shown when someone posts this guide's link: loc/<id>/og.png.
 * A location without one gets the front page's image.
 */
export const GET: APIRoute = async () => {
  let png: Buffer;
  try {
    png = await readFile(path.join(LOC_DIR, 'og.png'));
  } catch {
    png = await readFile(path.join(process.cwd(), 'site', 'public', 'og.png'));
  }
  return new Response(png, { headers: { 'content-type': 'image/png' } });
};
