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
  /**
   * Optional short list under the breweries for places that aren't breweries
   * (distilleries, a winery…): named and linked, nothing more.
   */
  /**
   * Optional clusters of breweries, each shown as its own colored group ("Ybor City",
   * "Seminole Heights"…). A brewery joins a cluster when its `area` is the cluster's
   * name or one of `match`. Breweries in no cluster are listed after the clusters,
   * under `otherAreasHeading`. Leave out for one plain list.
   */
  areas?: {
    name: string;
    /** Other `area` values that belong to this cluster. */
    match?: string[];
    /** Short line under the name ("All within a few blocks"). */
    note?: string;
    /** Any CSS color. Defaults to the next color in the area palette (shared/theme.css). */
    color?: string;
  }[];
  /** Heading for breweries outside every cluster. Defaults to "Around town". */
  otherAreasHeading?: string;
  alsoNearby?: {
    heading: string;
    intro?: string;
    places: { name: string; url: string; note?: string }[];
  };
}

export const LOC_ID = process.env.GUIDE_TARGET ?? '';
export const LOCATION = location as Location;
/** loc/<id>, where this location's breweries, manual.yaml, placement.yaml and fixtures live. */
export const LOC_DIR = path.join(process.cwd(), 'loc', LOC_ID);
