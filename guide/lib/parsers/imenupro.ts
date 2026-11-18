import { fetchText } from '../fetch';
import { cheerio, decodeEntities } from './html';

/**
 * iMenuPro (imenupro.com) menus. The embed script `https://imenupro.com/!<code>` redirects
 * to a JS file that holds the menu as an HTML string. Some breweries publish a picture
 * instead (then there are no items and this returns an empty list).
 */
export interface IMenuProItem {
  section?: string;
  name: string;
  description?: string;
  /** The "extras" line, e.g. "Mild Fruit, Dry & Crisp  5.2% abv". */
  extras?: string;
}

export async function fetchIMenuPro(code: string, fixture: string): Promise<IMenuProItem[]> {
  const js = await fetchText(`https://imenupro.com/!${code}`, { fixture });
  return parseIMenuPro(js);
}

export function parseIMenuPro(js: string): IMenuProItem[] {
  // imenupro['code']['html'] = '<div …>\
  // …';
  const m = js.match(/\['html'\]\s*=\s*'((?:[^'\\]|\\.)*)'/s);
  if (!m) return [];
  const markup = m[1].replace(/\\\r?\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const $ = cheerio.load(markup);
  const out: IMenuProItem[] = [];
  let section: string | undefined;
  const text = (el: any) => decodeEntities($(el).text()).replace(/\s+/g, ' ').trim() || undefined;
  $('[class*="imp-normal-heading"], .imp-food-item').each((_, el) => {
    if (!$(el).hasClass('imp-food-item')) {
      section = text(el);
      return;
    }
    const name = text($(el).find('.imp-name').first());
    if (!name) return;
    out.push({
      section,
      name,
      description: text($(el).find('.imp-description').first()),
      extras: text($(el).find('.imp-extras').first()),
    });
  });
  return out;
}
