# pourguide.beer

The pourguide.beer front page and every city guide, built from this one repo and uploaded together.

```
site/                 the pourguide.beer front page
guide/                the city guide: page, styles, parsers and shared helpers (one copy for every city)
shared/theme.css      colors, fonts and sizes, used by the front page and every guide
loc/locations.yaml    the list of locations, in front-page order
loc/<id>/             one folder per location (jax, gnv…)
  location.json         name, address, title, the big name at the top, footer note
  breweries.ts          that city's breweries and where each one's data comes from
  manual.yaml           hand-entered extras (weekly nights, tap lists that aren't online)
  placement.yaml        brewery order and paid "Featured" spots
  fixtures/             saved copies of every source, for offline builds
scripts/build-all.mjs builds everything into dist/
```

`npm run build` builds every location, then the front page, and lays them out in `dist/` exactly as they go on the server:

```
dist/              → pourguide.beer
dist/loc/<id>/     → <id>.pourguide.beer
dist/loc/.htaccess → sends pourguide.beer/loc/<id>/ to the subdomain
```

GitHub Actions does this every 4 hours and uploads `dist/` over FTP with one account.

## Adding a location

1. **Code:** copy `loc/jax/` to `loc/<id>/`. Edit `location.json`, replace the breweries in `breweries.ts`, and empty `manual.yaml`, `placement.yaml` and `fixtures/`.
2. **List:** add it to `loc/locations.yaml` with `status: soon`.
3. **Hosting:** in cPanel, add the subdomain `<id>.pourguide.beer` with its folder set to `loc/<id>` inside pourguide.beer's folder. In Cloudflare DNS for pourguide.beer, add a `CNAME` named `<id>` pointing at `pourguide.beer` (proxied).
4. **Go live:** push. Once the subdomain loads, change it to `status: live` so the front page links to it and shows its counts.

No new repo, workflow, secrets or FTP account is needed.

### Writing a location's `breweries.ts`

Each brewery is a `BreweryDef` with its address, hours and one or more `sources`. A source returns any of `{ taps, tapsNote, items }`. The building blocks are in `guide/lib/kit.ts` and `guide/lib/parsers/`:

| The brewery uses | Use |
|---|---|
| Untappd for Business menu (`PreloadEmbedMenu("…", location, theme)` in the page) | `untappdTaps(location, theme, fixture)` |
| Arryved digital menu (`commerce.arryved.com/digitalmenus/menu/<id>`) | `fetchArryvedMenu` + `parseArryvedMenu` |
| Update.Beer (`createMenuClient("<id>")` in the site's code) | `fetchUbTaps`, `fetchUbEvents` |
| Public Google Calendar | `expandIcs(googleIcsUrl(id))` |
| WordPress *The Events Calendar* | `tribeItems` on `/wp-json/tribe/events/v1/events` |
| EventsCalendar.co widget | `eventsCalendarUrl` + `expandEventsCalendar` |
| Squarespace menu block / events / summary blocks | `parseSqsMenu`, `parseSqsCollection`, `parseSqsMonthItems` |
| Squarespace list sections (one list per group of beers) | `parseSqsUserItems` |
| iMenuPro menu (`imenupro.com/!<code>`) | `fetchIMenuPro` + `parseIMenuPro` |
| BentoBox site with dated event pages | `fetchBentoEvents(origin, fixturePrefix)` |
| SpotHopper site (images on static.spotapps.co) | `parseSpotMenu`, `parseSpotEvents` |
| Craftpeak / Arryved website ("Powered by Arryved", a `.taplist` block) | `parseCraftpeakTaplist` |
| BeerMenus web menu or widget (`beermenus.com/web_menus/<id>`, `menu_widgets/<id>`) | `parseBeerMenus`, `fetchBeerMenusWidget` |
| Zoogle calendar (images.zoogletools.com) | `parseZoogleEvents` + `zoogleTimes` |
| WordPress Eventer plugin (`/eventer/<slug>/edate/<date>` links) | `parseEventerList` |
| Nothing readable | `noteOnly('Tap list', 'Where their list lives')`, plus `manual.yaml` |

A brewery that serves food from its own kitchen gets `kitchen: { name?, menuUrl? }`. Its Food trucks column then says so and links to the menu (if there is one online), whether or not trucks are listed.

A location can group its breweries into colored clusters by neighborhood with `areas` in `location.json`: `[{ name, match?, note?, color? }]`. A brewery joins a cluster when its `area` is the cluster's `name` or one of `match`. Each cluster gets a colored stripe, a heading and a jump link under the summary; breweries are shuffled within each cluster, and any not in a cluster go last under `otherAreasHeading` (default "Around town"). Colors default to the area palette in `shared/theme.css`. `loc/tpa/location.json` has an example. Leave `areas` out for one plain list.

`manual.yaml` recurring items can take `weeks: [1, 3]` (1st and 3rd of the month) or `weeks: [-1]` (last).

Each location has a share image, `loc/<id>/og.png` (1200×630), shown when its link is posted on Reddit, Facebook, in texts and so on; the front page's is `site/public/og.png`. A location without one uses the front page's. `scripts/og-images.py` regenerates them (optional; needs Python and Playwright).

A location can name places that aren't breweries (distilleries, a winery) in `location.json` under `alsoNearby: { heading, intro, places: [{ name, url, note }] }`. They're listed and linked under the breweries, with no taps or hours. `loc/staug/location.json` has an example.

`loc/jax/breweries.ts`, `loc/gnv/breweries.ts` and `loc/staug/breweries.ts` have an example of each. A fix to a parser or the page in `guide/` reaches every location on the next build.

## When something breaks

- **One brewery source:** each one runs on its own. If it fails, the brewery falls back to the last good copy (in `.cache/`, which the workflow keeps between runs) with a short note to visitors.
- **A whole location:** if its build fails, `build-all` uses that location's last good build (`.cache/last-good/<id>`), so it stays online unchanged. The build log says which one failed.
- **The front page:** if it fails, the build stops and nothing is uploaded.

`npm run check-sources` prints which sources worked in the last build, location by location. The workflow runs it on every build.

## Running it locally

```bash
npm install
npm run build                     # everything, live data → dist/
npm run build:fixtures            # everything, from saved fixtures (no network)
npm run dev -- jax                # one guide, live data, http://localhost:4321
npm run dev -- jax --fixtures     # one guide, from loc/jax/fixtures
npm run dev -- index              # the front page
npm run check-sources
```

On Windows PCs that block Astro's compiled helpers ("An Application Control policy has blocked this file"), the scripts switch the blocked ones to their WebAssembly versions automatically. See `scripts/astro.mjs`.

To refresh a location's fixtures, run a live build with `GUIDE_RECORD=1`. `GUIDE_NOW` sets the pretend "now" for fixture builds (default: `fixturesNow` in `location.json`).

## Deploying

The workflow is `.github/workflows/deploy-ftp.yml`. It needs four repository secrets (**Settings → Secrets and variables → Actions**):

- `FTP_SERVER`: the FastComet server hostname
- `FTP_USERNAME` / `FTP_PASSWORD`: the FTP account for pourguide.beer's main folder
- `FTP_DIR`: `./`

The upload only sends files that changed, and only removes files it uploaded itself. A location marked `build: false` in `locations.yaml` is left alone on the server, which is how a location still deployed from somewhere else is kept out of the way.

If your host only offers plain FTP, change `protocol: ftps` to `protocol: ftp` in the workflow. GitHub pauses scheduled workflows in repos with no activity for 60 days. Any commit restarts the clock.

## The guide page

These work the same in every location:

- **Brewery order:** `loc/<id>/placement.yaml`. Breweries under `pinned` come first with a "Featured" label. The rest are shuffled on every page load.
- **Non-alcoholic filter:** drinks at 0.5% ABV or less, or named as kombucha, soda, NA beer and so on (`isNonAlcoholic` in `guide/lib/srm.ts`). Saved in the address as `?na=1`.
- **Style filter and ABV sort:** style families are in `guide/lib/styles.ts`. Both are saved in the address (`?style=ipa&sort=abv-desc`).
- **Hand-entered data:** `loc/<id>/manual.yaml` adds weekly nights, one-off events and tap lists, or hides things a scraper got wrong. The format is described at the top of each file.
- **Look:** every color, font and size is in `shared/theme.css`. Layout is in `guide/styles/site.css` and `site/styles/site.css`.

Requests identify themselves as `pourguide.beer-aggregator/1.0 (+<the guide's address>)`, and scraped HTML pages are skipped if the site's `robots.txt` disallows them.

## Location notes

### Jacksonville (`loc/jax`)

The breweries on the [Jax Ale Trail](https://www.visitjacksonville.com/jax-ale-trail/breweries/) list as of November 2026, except Disco Witch Brewing, which closed at the end of 2025. Ten publish a readable tap list. Aardwolf (PDF), Congaree and Penn, Grace Note, Green Room, Legacy (image), Myrtle Avenue, Ruby Beach, SJ Brewing, Strings and Wicked Barley don't, so their rows show address, hours and a note. Weekly nights for Bold City, Grace Note, Southern Swells, Strings Jax Beach and SJ are in `manual.yaml`. Tepeyolot's Untappd menu returned "not found" when the guide was built; it comes back on its own if they fix it.

### Gainesville (`loc/gnv`)

First Magnitude, Swamp Head, Cypress & Grove, Blackadder, Grand Scheme, Daft Cow and High Springs. Also served at gnv.beer, whose document root is the same `loc/gnv` folder. Grand Scheme's tap list is an image on Instagram, Cypress & Grove only lists core beers, and Daft Cow's hours aren't published in a readable form.

### St. Augustine (`loc/staug`)

The breweries on Florida's Historic Coast [craft beverages](https://www.floridashistoriccoast.com/food-drink/craft-beverages/) list as of November 2026: The Bog, Bootlegger Beach (at Jack's Bar-B-Que), Dog Rose, Hornski's and Old Coast Ales. Ancient City Brewing, Disco Witch and King Maker are closed, and A1A Ale Works no longer brews, so they're left out. The distilleries and San Sebastian Winery are named under "Not beer, but nearby" (`alsoNearby` in `location.json`). Dog Rose posts its beer menu as an image and Bootlegger Beach only uses Instagram, so their rows show a note; Dog Rose's weekly pizza and Sunday band are in `manual.yaml`, and its dated events and food trucks come from its BentoBox event pages. Old Coast's dated music line-up on its home page was out of date when the guide was built, so the guide also shows "Live music" on Wednesday evenings for any week without a named act.

### Dunedin (`loc/dunedin`)

The Dunedin breweries on the Gulp Coast beer trail's north region, November 2026: 7venth Sun, Caledonia, Cueni, Dunedin Brewery, HOB, Soggy Bottom and Woodwright. Truck & Ladder (formerly Beach Island) has closed. Woodwright and Dunedin Brewery don't post a tap list. Caledonia's weekly and monthly nights are in `manual.yaml`. Cotherman Distilling is under "Not beer, but nearby".

### St. Pete (`loc/stpete`)

The Gulp Coast trail's south region: St. Petersburg, Gulfport and the beaches, in three clusters (Grand Central & Warehouse Arts, Downtown & the Edge, The Beaches) plus Gulfport. Live tap lists from Grand Central, Green Bench and Mad Beach; events from 3 Daughters, Bayboro and Green Bench. Right Around the Corner, Cage, St. Pete Brewing and Mastry’s only load their menus in a browser, so those rows show a note. Overflow has no working website.

### Tampa (`loc/tpa`)

By neighborhood: Ybor City, Seminole Heights, and Tampa Heights & Downtown, plus Tampa Bay Brewing's Westchase brewpub. Live tap lists from Angry Chair and both Magnanimous taprooms (BeerMenus). Cigar City is listed in Ybor as opening soon (it left Spruce Street in 2026). Left out because they've closed: Tampa Bay Brewing's Ybor taproom, Florida Avenue's Seminole Heights taproom, Southern Brewing & Winemaking, and 7venth Sun's Seminole Heights taproom.

### Clearwater (`loc/clw`)

The Gulp Coast trail's central and north regions without Dunedin, plus 3 Daughters' Clearwater Beach rooftop: clusters for Clearwater (with the beach and Safety Harbor), Palm Harbor and Tarpon Springs, then Largo, Seminole and Indian Rocks Beach. Live tap lists from Crooked Thumb, de Bine and Rapp; Rapp's food trucks come from its Google Calendar. Troubled Waters (Safety Harbor) is left out because its website has lapsed and it couldn't be confirmed open.
