# pourguide.beer

The front door for the local brewery guides. It lists every city guide (each on its own subdomain, like `gnv.pourguide.beer`) with a link, and for live guides it shows how many breweries and beers the guide covers, plus a row of pint glasses for that city's beers, pale to dark.

Built with [Astro](https://astro.build) as a static site, and styled with the same `theme.css` as the city guides.

## Adding or changing a city

Edit `src/data/guides.yaml`:

```yaml
guides:
  - id: gnv
    name: Gainesville
    region: Florida
    url: https://gnv.pourguide.beer
    status: live
  - id: ocala
    name: Ocala
    region: Florida
    url: https://ocala.pourguide.beer
    status: soon        # shown as "Coming soon", with no link
```

Cities appear in the order listed. Push the change and the site rebuilds within a couple of minutes.

### Where each guide lives on the host

Every city guide is its own project and repo, and uploads into its own folder under this site's folder:

```
<pourguide.beer folder>/        this site
<pourguide.beer folder>/loc/gnv/  gnv.pourguide.beer
<pourguide.beer folder>/loc/jax/  jax.pourguide.beer
```

For a new city `<id>`:

1. In cPanel, add the subdomain `<id>.pourguide.beer` with its folder set to `loc/<id>` inside pourguide.beer's folder.
2. In Cloudflare DNS for pourguide.beer, add a record for `<id>` (a `CNAME` to `pourguide.beer`, proxied, works).
3. In the city's own repo, set the FTP secrets so it uploads to `loc/<id>`. With an FTP account that opens in that folder, `FTP_DIR` is `./`.
4. Add the city to `src/data/guides.yaml` here.

This site's own uploads only replace files it put there itself, so they never touch `loc/`.

## Where the numbers come from

Each city guide publishes its whole dataset at `/data.json`. When this site builds, it reads that file for every live guide and counts the breweries and beers. It rebuilds once a day, so the counts stay current.

If a guide's data can't be reached, its row still appears with its name and link, just without the numbers. The build log says which address failed.

By default the data is read from `<url>/data.json`. Gainesville has a `data:` line pointing at `https://gnv.beer/data.json` while the guide is still at its old address; delete that line once `gnv.pourguide.beer` is live.

## Keeping the look in step with the guides

`src/styles/theme.css` is a copy of the same file in the gnv guide. It holds every color, font and text size. When you change the look of the guides, copy the updated `theme.css` here too. If the accent color changes, also update `<meta name="theme-color">` in `src/pages/index.astro`.

`src/styles/site.css` holds this page's layout, and only refers to the settings in `theme.css` by name.

## Running it

```bash
npm install
npm run dev              # http://localhost:4321, reads live guide data
npm run build            # builds the site into dist/
npm run build:fixtures   # offline, using fixtures/gnv-data.json
```

### "An Application Control policy has blocked this file"

Some Windows PCs block the compiled helper files (`.node`) that Astro uses. The npm scripts
check for this first. For each blocked helper, they install its WebAssembly version on that
computer only (package.json and package-lock.json stay the same), and Astro switches to it by
itself. Helpers that aren't blocked are left alone. The site comes out the same. The GitHub
build isn't affected. The check is in `scripts/astro.mjs`. `GUIDE_HELPERS=native` skips it,
and `GUIDE_HELPERS=wasm` uses WebAssembly for everything.

## Deploying

`.github/workflows/deploy-ftp.yml` builds the site and uploads it to the web host, the same way the gnv guide does. It needs its own GitHub repo and its own four secrets (`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_DIR`); the comments at the top of the file say what each one is.
