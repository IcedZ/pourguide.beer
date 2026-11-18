import { cheerio, decodeEntities } from './html';

/**
 * Craftpeak / Arryved websites ("Powered by Arryved", images on cooler-images.arryved.com).
 * A location page lists what's pouring in a `.taplist` block, each beer with icons for
 * how it's sold (draft, can, bottle, growler) and a guest icon for other breweries' beer.
 */
export interface CraftpeakItem {
  name: string;
  abv?: number;
  /** The short line under the name ("Creamsicle Wheat"). */
  descriptor?: string;
  draft: boolean;
  packaged: boolean;
  guest: boolean;
  /** The heading above the list it came from ("What's On Tap", "Beer-to-Go"). */
  heading?: string;
}

export function parseCraftpeakTaplist(html: string): CraftpeakItem[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const out: CraftpeakItem[] = [];
  // Some sites (the Untappd-fed variant) have no format icons; then the heading above each
  // list says what it is: "What's On Tap" vs "Beer-to-Go".
  let heading: string | undefined;
  $('h1, h2, h3, .taplist .list-item').each((_, el) => {
    if (!$(el).hasClass('list-item')) {
      if (!$(el).closest('.taplist').length) heading = text(el) || heading;
      return;
    }
    const name = text($(el).find('.item-title').first());
    if (!name) return;
    const icons = $(el)
      .find('.format-icon')
      .map((_, i) => ($(i).attr('alt') ?? '').toLowerCase())
      .get()
      .join(' ');
    const abv = text($(el).find('.item-abv .value').first()).match(/(\d+(?:\.\d+)?)/);
    const guest = /guest/.test(icons);
    let draft = /draft|growler|crowler/.test(icons);
    let packaged = /can|bottle/.test(icons);
    if (!icons.trim()) {
      packaged = /to[\s-]?go|package|cans?\b|bottles?/i.test(heading ?? '');
      draft = !packaged;
    }
    out.push({
      name,
      abv: abv ? Number(abv[1]) : undefined,
      descriptor: text($(el).find('.item-descriptor').first()) || undefined,
      // A guest beer with no format icon is a guest tap.
      draft: draft || (guest && !packaged),
      packaged,
      guest,
      heading,
    });
  });
  return out;
}
