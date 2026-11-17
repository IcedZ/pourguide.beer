import { fetchJson, recordFixture, useFixtures } from '../fetch';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOC_DIR } from '../location';

/**
 * Arryved "digital menus" (the tap list boards breweries embed from commerce.arryved.com).
 * The public page signs in anonymously and then asks for the menu, so we do the same:
 *   preauth → anonymous → digitalmenus/get
 */
const API = 'https://customer-api.arryved.com/api/v1';

export interface ArryvedItem {
  section: string;
  name: string;
  /** The menu's description line, e.g. "Cold IPA - 2nd Bay". */
  description?: string;
  abv?: number;
  /** Who brewed it, as entered by the brewery. */
  brewery?: string;
}

function requestInfo() {
  return {
    requestId: crypto.randomUUID().replace(/-/g, ''),
    clientApiVersion: '1.3.0',
    clientName: 'Online Ordering',
    clientVersion: '2.4',
  };
}

async function post(pathname: string, body: unknown, key?: string): Promise<any> {
  return fetchJson(`${API}${pathname}`, {
    fixture: 'unused',
    init: {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        origin: 'https://commerce.arryved.com',
        ...(key ? { 'x-api-key': key } : {}),
      },
    },
  });
}

/** Raw menu response for a public menu id (the number in …/digitalmenus/menu/<id>). */
export async function fetchArryvedMenu(publicId: string, fixture: string): Promise<any> {
  if (useFixtures) return JSON.parse(await readFile(path.join(LOC_DIR, 'fixtures', fixture), 'utf8'));
  const networkId = crypto.randomUUID();
  const pre = await post('/authentication/preauth', { requestInfo: requestInfo(), preauth: { networkId } });
  const preToken = pre?.preauth?.token;
  if (!preToken) throw new Error('Arryved: no preauth token');
  const anon = await post('/authentication/anonymous', { requestInfo: requestInfo(), anonymous: { networkId } }, preToken);
  const token = anon?.anonymous?.token;
  if (!token) throw new Error('Arryved: no session token');
  const menu = await post('/digitalmenus/get', { requestInfo: requestInfo(), publicId }, token);
  if (!menu?.digitalMenu) throw new Error(`Arryved: ${menu?.errorInfo?.message ?? 'menu not returned'}`);
  await recordFixture(fixture, JSON.stringify(menu));
  return menu;
}

/** The items shown on the board, in board order, skipping kicked and hidden ones. */
export function parseArryvedMenu(menu: any): ArryvedItem[] {
  const items: Record<string, any> = menu.items ?? {};
  const out: ArryvedItem[] = [];
  const byOrder = (a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  const pages = [...(menu.digitalMenu?.pages ?? [])].sort((a, b) => byOrder(a.page, b.page));
  for (const pg of pages) {
    for (const sec of [...(pg.sections ?? [])].sort((a, b) => byOrder(a.section, b.section))) {
      for (const mi of [...(sec.menuItems ?? [])].sort(byOrder)) {
        const it = items[mi.locationInventoryItemId];
        if (!it || it.state === 'INACTIVE' || it.state === 'OUT' || !mi.allowedSizes?.length) continue;
        const d = it.displayDetails ?? {};
        const abv = (it.attributes ?? []).find((a: any) => a.type === 'ABV')?.value;
        const clean = (s?: string) => (s && s !== 'None' ? s.replace(/\s+/g, ' ').trim() : undefined);
        out.push({
          section: clean(sec.section?.name) ?? '',
          name: clean(d.name) ?? '',
          description: clean(d.description),
          abv: abv !== undefined && abv !== '' && !Number.isNaN(Number(String(abv).replace('%', ''))) ? Number(String(abv).replace('%', '')) : undefined,
          brewery: clean(d.guestName),
        });
      }
    }
  }
  return out.filter((i) => i.name);
}
