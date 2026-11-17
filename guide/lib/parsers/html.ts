import * as cheerio from 'cheerio';

const BLOCK = 'p,div,h1,h2,h3,h4,h5,h6,li,br,section,article,tr,td,th,header,footer,span.line';

/** Visible-ish text of a page as trimmed, non-empty lines (block elements become line breaks). */
export function htmlToLines(html: string, rootSelector = 'body'): string[] {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,template').remove();
  $(BLOCK).each((_, el) => {
    $(el).prepend('\n').append('\n');
  });
  const text = $(rootSelector).text();
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function decodeEntities(s: string): string {
  return cheerio.load(`<i>${s}</i>`)('i').text();
}

export function stripHtml(s: string): string {
  return cheerio.load(`<div>${s}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}

/** "5.6%", "ABV: 5.6%", "5.6 % ABV" → 5.6 */
export function parseAbv(s: string): number | undefined {
  const m = s.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
  return m ? Number(m[1]) : undefined;
}

/** Title-case an ALL-CAPS string so tap lists don't shout. Leaves mixed case alone. */
const ACRONYMS = /\b(ipa|neipa|wcipa|dipa|hpa|apa|esb|ddh|bbq|pb&j)\b/gi;

export function tidyCase(s: string): string {
  return tidyCaseInner(s).replace(ACRONYMS, (m) => m.toUpperCase());
}

function tidyCaseInner(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  const letters = t.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const lower = letters.replace(/[^a-z]/g, '').length;
  if (letters.length < 3) return t;
  // Mostly caps, or mostly lower → normalise.
  if (upper / letters.length > 0.7 || lower / letters.length > 0.9) {
    const small = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'with', 'from', 'for', 'to', 'or']);
    const keepUpper = /^(IPA|NEIPA|WCIPA|DIPA|HPA|APA|ESB|IBU|ABV|NA|UF|PB&J|II|III|IV|DDH|BBQ|FSU|USA|GNV|JAX|FL|NZ|JU|UNF|NE|WC|IPL|THC)$/i;
    return t
      .toLowerCase()
      .split(' ')
      .map((w, i) => {
        const bare = w.replace(/[^A-Za-z&]/g, '');
        if (keepUpper.test(bare)) return w.toUpperCase();
        if (i > 0 && small.has(bare)) return w;
        return w.replace(/^([^a-z]*)([a-z])/, (_, p, c) => p + c.toUpperCase());
      })
      .join(' ');
  }
  return t;
}

export { cheerio };
