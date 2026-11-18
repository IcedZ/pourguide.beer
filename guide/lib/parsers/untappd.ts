import { cheerio, parseAbv } from './html';

export interface UntappdItem {
  section?: string;
  name: string;
  style?: string;
  abv?: number;
  brewery?: string;
  description?: string;
}

/** The script URL behind an Untappd for Business embedded menu. */
export function untappdEmbedUrl(locationId: number, themeId: number): string {
  return `https://business.untappd.com/locations/${locationId}/themes/${themeId}/js`;
}

/**
 * The embed script is `function EmbedMenu(id){ … container.innerHTML = "<menu html>"; … }`.
 * Pull the HTML string out without executing anything.
 */
export function extractUntappdHtml(js: string): string {
  const m = js.match(/container\.innerHTML\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error('Untappd embed: menu HTML not found');
  // JS string literal → JSON string literal: drop escapes JSON doesn't allow (\' \$ …).
  // Walk escape pairs left to right so an escaped backslash (\\) stays intact.
  const json = m[1]
    .replace(/\\(.)/gs, (_, c: string) => ('"\\/bfnrtu'.includes(c) ? `\\${c}` : c))
    // Raw tabs and other control characters are fine in JS strings but not in JSON.
    .replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return JSON.parse(json);
}

/** Items from an Untappd menu (the "standard" theme), grouped by section heading. */
export function parseUntappdMenu(html: string): UntappdItem[] {
  const $ = cheerio.load(html);
  const out: UntappdItem[] = [];
  $('.section').each((_, sec) => {
    const section = $(sec).find('.section-name').first().text().trim() || undefined;
    $(sec)
      .find('.menu-item')
      .each((_, it) => {
        const nameEl = $(it).find('.item-name');
        const name =
          nameEl.find('span[id]').first().text().trim() ||
          nameEl.find('a').first().text().replace(/^\s*\d+\.\s*/, '').trim() ||
          nameEl.clone().children('.item-style').remove().end().text().replace(/^\s*\d+\.\s*/, '').trim();
        if (!name) return;
        const text = (sel: string) => $(it).find(sel).first().text().replace(/\s+/g, ' ').trim() || undefined;
        out.push({
          section,
          name,
          style: text('.item-style'),
          abv: parseAbv(text('.item-abv') ?? ''),
          brewery: text('.brewery'),
          description: text('.item-description p'),
        });
      });
  });
  return out;
}
