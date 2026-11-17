import path from 'node:path';
// The location being built (loc/<id>/location.json). astro.config.mjs points @loc at
// that folder, based on GUIDE_TARGET.
import location from '@loc/location.json';

export interface Location {
  name: string;
  url: string;
  timezone: string;
  title: string;
  description: string;
  shareTitle: string;
  shareDescription: string;
  /** HTML for the big name at the top. `<span>` pieces get the accent color. */
  wordmark: string;
  /** Show a small "pourguide.beer" link above the name. */
  showPourguideAbove: boolean;
  /** Optional HTML at the start of the footer's second line. */
  footerNote: string;
  /** Pretend "now" for offline builds, when the fixtures were captured. */
  fixturesNow: string;
}

export const LOC_ID = process.env.GUIDE_TARGET ?? '';
export const LOCATION = location as Location;
/** loc/<id>, where this location's breweries, manual.yaml, placement.yaml and fixtures live. */
export const LOC_DIR = path.join(process.cwd(), 'loc', LOC_ID);
