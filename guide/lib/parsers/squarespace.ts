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

export interface SqsListItem {
  /** The list's own title, or else the heading above it ("Lagers", "Hoppy"…). */
  section?: string;
  title: string;
  description?: string;
}

/**
 * Squarespace "list" sections (user items). The items are in the list's
 * `data-current-context` JSON; the section name is the last heading before
 * the list on the page (headings inside lists don't count).
 */
export function parseSqsUserItems(html: string): SqsListItem[] {
  const $ = cheerio.load(html);
  const out: SqsListItem[] = [];
  let lastHeading = '';
  $('h1, h2, h3, h4, [data-current-context]').each((_, el) => {
    if (!$(el).is('[data-current-context]')) {
      if ($(el).closest('[data-current-context]').length) return;
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t) lastHeading = t;
      return;
    }
    let ctx: any;
    try {
      ctx = JSON.parse($(el).attr('data-current-context') ?? '');
    } catch {
      return;
    }
    const items: any[] = ctx?.userItems ?? [];
    if (!items.length) return;
    // The list's own title, when it has one; otherwise the heading above it.
    const section = ctx?.isSectionTitleEnabled && ctx?.sectionTitle ? stripHtml(String(ctx.sectionTitle)) : lastHeading;
    for (const it of items) {
      const title = String(it.title ?? '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      out.push({ section: section || undefined, title, description: it.description ? stripHtml(it.description) || undefined : undefined });
    }
  });
  return out;
}
