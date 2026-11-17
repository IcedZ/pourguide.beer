/**
 * Browser side: picks the right days for the chosen range using the visitor's
 * current date (so a page built last night still shows "today" correctly),
 * and refreshes open/closed status.
 */
import { addDays, dayKey, TZ } from './time';
import { openStatus } from './view';
import type { Hours } from './types';
import { familyById } from './styles';

type Range = 'today' | 'weekend' | 'week';
const RANGES: Range[] = ['today', 'weekend', 'week'];
const SUFFIX: Record<Range, string> = { today: 'today', weekend: 'this weekend', week: 'in the next 7 days' };

function nowLocal() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    now,
    today: dayKey(now),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function daysFor(range: Range, today: string, dow: number): Set<string> {
  const span = (start: string, n: number) => new Set(Array.from({ length: n }, (_, i) => addDays(start, i)));
  if (range === 'today') return span(today, 1);
  if (range === 'week') return span(today, 7);
  // Weekend = Friday–Sunday. During the weekend, from today through Sunday.
  if (dow === 0) return span(today, 1);
  if (dow >= 5) return span(today, 7 - dow + 1);
  return span(addDays(today, 5 - dow), 3);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Beers shown before "Show all" when no filter is on. Matches VISIBLE in BreweryRow.astro. */
const VISIBLE = 6;

export function initPage() {
  const t = nowLocal();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-set-range]')];
  const articles = [...document.querySelectorAll<HTMLElement>('article.brewery')];
  const summary = document.querySelector<HTMLElement>('[data-summary]');

  const dateline = document.querySelector<HTMLElement>('[data-dateline]');
  if (dateline) {
    dateline.textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(t.now);
  }

  function apply(range: Range) {
    const days = daysFor(range, t.today, t.dow);
    document.body.dataset.range = range;
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(btn.dataset.setRange === range));

    let food = 0;
    let events = 0;
    for (const art of articles) {
      for (const col of art.querySelectorAll<HTMLElement>('.col-food, .col-events')) {
        let shown = 0;
        for (const g of col.querySelectorAll<HTMLElement>('.day')) {
          const on = days.has(g.dataset.day!);
          g.hidden = !on;
          if (on) shown += g.querySelectorAll('.item').length;
        }
        const empty = col.querySelector<HTMLElement>('.empty');
        if (empty) empty.hidden = shown > 0;
        if (col.classList.contains('col-food')) food += shown;
        else events += shown;
      }
    }
    counts = { food, events, range };
    renderSummary();
  }

  // ---- Drink filters and sort. State lives in the controls and in the URL
  // (?na=1&style=ipa&sort=abv-desc) so a filtered view can be shared or bookmarked.
  const naBox = document.querySelector<HTMLInputElement>('input[data-filter="na"]');
  const styleSel = document.querySelector<HTMLSelectElement>('select[data-control="style"]');
  const sortSel = document.querySelector<HTMLSelectElement>('select[data-control="sort"]');
  const params = new URLSearchParams(location.search);
  let counts = { food: 0, events: 0, range: 'today' as Range };
  let drinkMatches = { total: 0, places: 0 };

  if (naBox) naBox.checked = params.get('na') === '1';
  if (styleSel && params.get('style')) styleSel.value = params.get('style')!;
  if (sortSel && params.get('sort')) sortSel.value = params.get('sort')!;

  const abvOf = (el: HTMLElement) => (el.dataset.abv === '' ? NaN : Number(el.dataset.abv));
  const orderOf = (el: HTMLElement) => Number(el.dataset.order);

  /** Sort by ABV when asked; drinks with no ABV listed go last; ties keep tap-list order. */
  function sorted(list: HTMLElement[], sort: string): HTMLElement[] {
    return [...list].sort((a, b) => {
      if (sort === 'abv-desc' || sort === 'abv-asc') {
        const x = abvOf(a), y = abvOf(b);
        if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
        if (!Number.isNaN(x) && x !== y) return sort === 'abv-desc' ? y - x : x - y;
      }
      return orderOf(a) - orderOf(b);
    });
  }

  function applyDrinks() {
    const na = !!naBox?.checked;
    const style = styleSel?.value ?? '';
    const sort = sortSel?.value ?? '';
    const fam = familyById(style);
    const filtering = na || !!fam;
    const matchesFilter = (el: HTMLElement) => (!na || el.dataset.na === '1') && (!fam || el.dataset.family === fam.id);

    styleSel?.closest('.select')?.classList.toggle('on', !!fam);
    sortSel?.closest('.select')?.classList.toggle('on', !!sort);

    // Words for headings, empty messages and the summary.
    const one = na && fam ? `non-alcoholic ${fam.one}` : na ? 'non-alcoholic drink' : fam ? fam.one : 'drink';
    const many = na && fam ? `non-alcoholic ${fam.many}` : na ? 'non-alcoholic drinks' : fam ? fam.many : 'drinks';
    const heading = !filtering ? 'On tap' : na && !fam ? 'Non-alcoholic' : cap(many);
    const noMatch = na && !fam ? 'No non-alcoholic drinks listed.' : `No ${many} on tap.`;

    let total = 0;
    let places = 0;
    for (const art of articles) {
      const ul = art.querySelector<HTMLElement>('[data-taps]');
      if (ul) {
        const items = [...ul.children] as HTMLElement[];
        const shown = sorted(filtering ? items.filter(matchesFilter) : items.filter((el) => el.dataset.beer === '1'), sort);
        const rest = items.filter((el) => !shown.includes(el)).sort((a, b) => orderOf(a) - orderOf(b));
        for (const el of [...shown, ...rest]) ul.appendChild(el);

        const expanded = art.dataset.expanded === '1';
        shown.forEach((el, i) => (el.hidden = !filtering && !expanded && i >= VISIBLE));
        rest.forEach((el) => (el.hidden = true));

        const more = art.querySelector<HTMLButtonElement>('[data-more]');
        if (more) {
          more.hidden = filtering || expanded || shown.length <= VISIBLE;
          more.textContent = `Show all ${shown.length}`;
        }
        const empty = art.querySelector<HTMLElement>('[data-no-match]');
        if (empty) {
          empty.hidden = !(filtering && shown.length === 0);
          empty.textContent = noMatch;
        }
        const count = art.querySelector<HTMLElement>('[data-tap-count]');
        if (count) count.textContent = shown.length ? String(shown.length) : '';
        if (filtering && shown.length) {
          total += shown.length;
          places++;
        }
      }
      const heads = art.querySelector<HTMLElement>('[data-tap-heading]');
      if (heads) heads.textContent = heading;
      const also = art.querySelector<HTMLElement>('[data-also]');
      if (also) also.hidden = filtering;

      // The row of glasses follows the same filter and order.
      const pour = art.querySelector<HTMLElement>('[data-pour]');
      if (pour) {
        const glasses = [...pour.children] as HTMLElement[];
        const keep = sorted(filtering ? glasses.filter(matchesFilter) : glasses, sort);
        const drop = glasses.filter((g) => !keep.includes(g));
        for (const g of [...keep, ...drop]) pour.appendChild(g);
        keep.forEach((g) => (g.hidden = false));
        drop.forEach((g) => (g.hidden = true));
        pour.hidden = keep.length === 0;
      }
    }
    drinkMatches = { total, places };
    renderSummary();
  }

  // "Show all" opens one brewery's full list.
  for (const art of articles) {
    art.querySelector<HTMLButtonElement>('[data-more]')?.addEventListener('click', () => {
      art.dataset.expanded = '1';
      applyDrinks();
    });
  }

  function renderSummary() {
    if (!summary) return;
    const base = `${plural(counts.food, 'food truck', 'food trucks')} and ${plural(counts.events, 'event', 'events')} at ${articles.length} breweries ${SUFFIX[counts.range]}.`;
    const na = !!naBox?.checked;
    const fam = familyById(styleSel?.value ?? '');
    if (!na && !fam) {
      summary.textContent = base;
      return;
    }
    const one = na && fam ? `non-alcoholic ${fam.one}` : na ? 'non-alcoholic drink' : fam!.one;
    const many = na && fam ? `non-alcoholic ${fam.many}` : na ? 'non-alcoholic drinks' : fam!.many;
    summary.textContent = `${plural(drinkMatches.total, one, many)} at ${plural(drinkMatches.places, 'brewery', 'breweries')}. ${base}`;
  }

  function writeUrl(range: Range) {
    const q = new URLSearchParams(location.search);
    const set = (k: string, v: string) => (v ? q.set(k, v) : q.delete(k));
    set('na', naBox?.checked ? '1' : '');
    set('style', styleSel?.value ?? '');
    set('sort', sortSel?.value ?? '');
    const search = q.toString() ? `?${q}` : '';
    history.replaceState(null, '', `${location.pathname}${search}${range === 'today' ? '' : `#${range}`}`);
  }

  for (const control of [naBox, styleSel, sortSel]) {
    control?.addEventListener('change', () => {
      applyDrinks();
      writeUrl(counts.range);
    });
  }

  function setRange(range: Range, push = true) {
    apply(range);
    if (push) writeUrl(range);
  }

  for (const btn of buttons) btn.addEventListener('click', () => setRange(btn.dataset.setRange as Range));

  const fromHash = location.hash.slice(1) as Range;
  let initial: Range = 'today';
  if (RANGES.includes(fromHash)) initial = fromHash;
  applyDrinks();
  setRange(initial, false);

  // Open / closed, as of right now.
  for (const art of articles) {
    const el = art.querySelector<HTMLElement>('[data-status]');
    const raw = art.dataset.hours;
    if (!el || !raw) continue;
    const s = openStatus(JSON.parse(raw) as Hours, t.dow, t.minutes);
    if (s) {
      el.textContent = s.text;
      el.dataset.open = String(s.open);
    }
  }
}
