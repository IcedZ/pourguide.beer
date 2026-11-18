import { cheerio, decodeEntities } from './html';
import { fetchText } from '../fetch';

/**
 * BeerMenus web menus (`beermenus.com/web_menus/<id>`, embedded with web-menus.js).
 * The page is plain HTML: `.menu-section` blocks ("On Tap", "TO GO") of `.item`s.
 */
export interface BeerMenusItem {
  section?: string;
  name: string;
  style?: string;
  abv?: number;
  /** "Tampa, FL" — where the brewer is. */
  from?: string;
  description?: string;
  /** "Draft", "Can", "Bottle"… */
  servings: string[];
}

export function beerMenusUrl(id: number): string {
  return `https://www.beermenus.com/web_menus/${id}`;
}

export function parseBeerMenus(html: string): BeerMenusItem[] {
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const out: BeerMenusItem[] = [];
  $('.menu-section').each((_, sec) => {
    const section = text($(sec).find('.section-name').first()) || undefined;
    $(sec)
      .find('.item')
      .each((_, it) => {
        const name = text($(it).find('.item-name').first());
        if (!name) return;
        const abv = text($(it).find('.item-abv').first()).match(/(\d+(?:\.\d+)?)/);
        out.push({
          section,
          name,
          style: text($(it).find('.item-style').first()) || undefined,
          abv: abv ? Number(abv[1]) : undefined,
          from: text($(it).find('.item-producer-location').first()) || undefined,
          description: text($(it).find('.item-description').first()) || undefined,
          servings: [...new Set($(it).find('.serving-type').map((_, s) => text(s)).get().filter(Boolean))],
        });
      });
  });
  return out;
}

/**
 * BeerMenus "menu widget" (`beermenus.com/menu_widgets/<id>`): a script that writes the menu
 * with `widgetDiv.innerHTML = "<html>"`. Items are `.list-item`s with `.beer-*` fields.
 */
export async function fetchBeerMenusWidget(id: number, fixture: string): Promise<BeerMenusItem[]> {
  const js = await fetchText(`https://www.beermenus.com/menu_widgets/${id}?v=2`, { fixture });
  return parseBeerMenusWidget(js);
}

export function parseBeerMenusWidget(js: string): BeerMenusItem[] {
  const m = js.match(/innerHTML\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error('BeerMenus widget: menu HTML not found');
  const html: string = JSON.parse(
    m[1]
      .replace(/\\(.)/gs, (_, c: string) => ('"\\/bfnrtu'.includes(c) ? `\\${c}` : c))
      .replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`),
  );
  const $ = cheerio.load(html);
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim();
  const out: BeerMenusItem[] = [];
  $('.list-item').each((_, it) => {
    const name = text($(it).find('.beer-name').first());
    if (!name) return;
    const abv = text($(it).find('.beer-abv').first()).match(/(\d+(?:\.\d+)?)/);
    out.push({
      name,
      style: text($(it).find('.beer-style').first()) || undefined,
      abv: abv ? Number(abv[1]) : undefined,
      from: text($(it).find('.beer-brewery-location').first()) || undefined,
      description: text($(it).find('.beer-description').first()) || undefined,
      servings: [...new Set($(it).find('.serving-type').map((_, s) => text(s)).get().filter(Boolean))],
    });
  });
  return out;
}
