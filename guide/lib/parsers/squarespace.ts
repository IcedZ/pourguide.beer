import { cheerio, parseAbv, stripHtml } from './html';

/** An item from a Squarespace events collection (?format=json → upcoming[]). */
export interface SqsEvent {
  title: string;
  startDate: number;
  endDate: number;
  fullUrl: string;
  excerpt?: string;
}

/** Upcoming events from `<collection>?format=json`. */
export function parseSqsCollection(json: any, origin: string): SqsEvent[] {
  const list: any[] = json?.upcoming ?? json?.items ?? [];
  return list.map((e) => ({
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    fullUrl: absolute(e.fullUrl, origin),
    excerpt: e.excerpt ? stripHtml(e.excerpt) : undefined,
  }));
}

/**
 * Items from `/api/open/GetItemsByMonth?month=M-YYYY&collectionId=…` — used when a
 * collection's own page is hidden but a summary block still shows its items.
 * Dates live under structuredContent there.
 */
export function parseSqsMonthItems(json: any, origin: string): SqsEvent[] {
  const list: any[] = Array.isArray(json) ? json : [];
  return list
    .map((e) => ({
      title: e.title,
      startDate: e.startDate ?? e.structuredContent?.startDate,
      endDate: e.endDate ?? e.structuredContent?.endDate,
      fullUrl: absolute(e.fullUrl, origin),
      excerpt: e.excerpt ? stripHtml(e.excerpt) : undefined,
    }))
    .filter((e) => typeof e.startDate === 'number');
}

export interface SqsMenuItem {
  menu: string;
  section?: string;
  title: string;
  description?: string;
  abv?: number;
}

/**
 * Squarespace "Menu" blocks: .menu-wrapper with one .menu per tab
 * (labels in .menu-select-labels, in the same order), each containing
 * .menu-section → .menu-item (.menu-item-title, .menu-item-description, .menu-item-price-*).
 */
export function parseSqsMenu(html: string): SqsMenuItem[] {
  const $ = cheerio.load(html);
  const out: SqsMenuItem[] = [];
  $('.menu-wrapper').each((_, wrap) => {
    const labels = $(wrap)
      .find('.menu-select-labels')
      .map((_, l) => $(l).text().trim())
      .get();
    $(wrap)
      .find('.menu')
      .each((i, menu) => {
        const menuName = $(menu).attr('aria-label') || labels[i] || '';
        $(menu)
          .find('.menu-section')
          .each((_, sec) => {
            const section = $(sec).find('.menu-section-title').first().text().trim() || undefined;
            $(sec)
              .find('.menu-item')
              .each((_, item) => {
                const title = $(item).find('.menu-item-title').first().text().trim();
                if (!title) return;
                const price = $(item).find('.menu-item-price-bottom, .menu-item-price-top').first().text();
                out.push({
                  menu: menuName,
                  section,
                  title,
                  description: $(item).find('.menu-item-description').first().text().trim() || undefined,
                  abv: parseAbv(price),
                });
              });
          });
      });
  });
  return out;
}

function absolute(url: string | undefined, origin: string): string {
  if (!url) return origin;
  return url.startsWith('http') ? url : origin.replace(/\/$/, '') + url;
}
