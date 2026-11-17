export type ItemKind = 'food' | 'event';

/** A food truck or an event on the calendar. */
export interface Item {
  kind: ItemKind;
  title: string;
  /** ISO timestamp for timed items; YYYY-MM-DD for all-day items. */
  start: string;
  end?: string;
  allDay: boolean;
  url?: string;
  description?: string;
}

export interface Beer {
  name: string;
  style?: string;
  abv?: number;
  description?: string;
  category?: string;
  /** Approximate beer color (hex), used for the pour bar. */
  color?: string;
  /** True for wine, cider, soda, kombucha… anything that isn't beer. */
  notBeer?: boolean;
  /** 0.5% ABV or less: NA beer, soda, kombucha… Drives the "Non-alcoholic only" filter. */
  na?: boolean;
  /** Style family id for the "Style" filter (see guide/lib/styles.ts). */
  family?: string;
}

export interface SourceStatus {
  name: string;
  ok: boolean;
  /** True when live fetch failed and we fell back to the last good copy. */
  stale?: boolean;
  fetchedAt?: string;
  error?: string;
}

/** A can, bottle or other package sold to go. Kept out of the tap list. */
export interface ToGoItem {
  name: string;
  style?: string;
  /** How it's sold, e.g. "16 oz 4-packs". */
  size?: string;
}

/** What one adapter returns. Any field it doesn't handle stays undefined. */
export interface SourceResult {
  taps?: Beer[];
  tapsNote?: string;
  /** Packaged beer to go, for the few breweries that list it. Shown apart from the taps. */
  toGo?: ToGoItem[];
  items?: Item[];
}

export interface Hours {
  /** 0 = Sunday … 6 = Saturday. [open, close] in 24h "HH:MM"; close may be past midnight ("01:00"). */
  [day: number]: [string, string] | null;
}

export interface Brewery {
  id: string;
  name: string;
  shortName?: string;
  area: string;
  address: string;
  mapsUrl: string;
  website: string;
  tapsUrl?: string;
  calendarUrl?: string;
  instagram?: string;
  hours?: Hours;
  hoursNote?: string;
  /** The brewery serves food from its own kitchen. Shown in the Food trucks column with a link to the menu. */
  kitchen?: {
    /** The kitchen's own name, if it has one ("Mateo's"). */
    name?: string;
    menuUrl: string;
  };
}

export interface BreweryData extends Brewery {
  taps: Beer[];
  tapsNote?: string;
  toGo?: ToGoItem[];
  items: Item[];
  sources: SourceStatus[];
}

export interface SiteData {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  breweries: BreweryData[];
}
