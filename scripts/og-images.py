"""
Regenerates the share images (1200x630 PNGs) shown when a guide's link is posted:
loc/<id>/og.png for each location and site/public/og.png for the front page.

Optional: needs Python 3 and Playwright (pip install playwright && playwright install chromium),
and a finished build (npm run build or build:fixtures) for the brewery counts and glass colors.
Writes to OG_OUT (default /tmp/og); copy the PNGs into place afterwards. Any 1200x630 PNG works
in their place if you'd rather design them by hand.

Add new locations to LOCS below.
"""
import json, html, os, asyncio, re
from playwright.async_api import async_playwright
PG=os.environ.get('PG', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCS=['gnv','jax','staug','dunedin','stpete','tpa','clw']
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]; return 0.299*r+0.587*g+0.114*b
def glasses(taps, n=30):
    cols=[t['color'] for t in taps if t.get('color') and not t.get('notBeer')]
    if not cols: return []
    cols.sort(key=lum, reverse=True)
    if len(cols)>n: cols=[cols[round(i*(len(cols)-1)/(n-1))] for i in range(n)]
    return cols
PINT='''<svg viewBox="0 0 20 28" width="34" height="48"><path d="M1.43 5.5 H18.57 L16.6 26.2 Q16.5 27 15.7 27 H4.3 Q3.5 27 3.4 26.2 Z" fill="{c}"/><path d="M1 1.6 Q1 1 1.6 1 H18.4 Q19 1 19 1.6 L18.57 5.5 H1.43 Z" fill="#f6efdc"/><path d="M1 1.6 Q1 1 1.6 1 H18.4 Q19 1 19 1.6 L16.6 26.2 Q16.5 27 15.7 27 H4.3 Q3.5 27 3.4 26.2 Z" fill="none" stroke="rgba(19,32,27,.28)" stroke-width="0.9"/></svg>'''
def page(top, word, glass_cols, line1, line2, url):
    g=''.join(PINT.format(c=c) for c in glass_cols)
    return f'''<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Big+Shoulders+Display:wght@700;900&display=block" rel="stylesheet">
<style>
*{{margin:0;box-sizing:border-box}} body{{width:1200px;height:630px;background:#edf0ea;color:#13201b;font-family:'Atkinson Hyperlegible',sans-serif;position:relative;overflow:hidden}}
.wrap{{position:absolute;inset:0;padding:56px 72px 0}}
.top{{font:700 40px/1 'Big Shoulders Display';letter-spacing:.02em;height:40px}}
.top span,.word span{{color:#e4a21b}}
.word{{font:900 200px/0.82 'Big Shoulders Display';letter-spacing:-.01em;white-space:nowrap;margin-top:22px;display:inline-block}}
.glasses{{display:flex;gap:3px;margin-top:44px;height:48px}}
.l1{{font-weight:700;font-size:38px;margin-top:30px;line-height:1.2}}
.l2{{font-size:28px;color:#4c5c55;margin-top:10px;line-height:1.3;max-width:1056px}}
.url{{position:absolute;right:72px;top:62px;font-size:28px;color:#4c5c55}}
.bar{{position:absolute;left:0;right:0;bottom:0;height:14px;background:#e4a21b}}
</style></head><body><div class="wrap">
<div class="top">{top}</div>
<div class="word" id="w">{word}</div>
<div class="glasses">{g}</div>
<div class="l1">{html.escape(line1)}</div>
<div class="l2">{html.escape(line2)}</div>
</div><div class="url">{html.escape(url)}</div><div class="bar"></div>
<script>
document.fonts.ready.then(()=>{{const w=document.getElementById('w');let s=200;while(w.scrollWidth>1056&&s>60){{s-=4;w.style.fontSize=s+'px'}}document.body.dataset.ready='1'}});
</script></body></html>'''
OUT=os.environ.get('OG_OUT','/tmp/og')
os.makedirs(OUT,exist_ok=True)
pages={}
all_taps=[]; names=[]
yaml=open(f'{PG}/loc/locations.yaml').read()
for loc in LOCS:
    L=json.load(open(f'{PG}/loc/{loc}/location.json'))
    d=json.load(open(f'{PG}/.build/{loc}/data.json'))
    taps=[t for b in d['breweries'] for t in b['taps']]
    all_taps+=taps; names.append(L['name'])
    n=len(d['breweries'])
    areas=[a['name'] for a in L.get('areas',[])]
    shorts=[b.get('shortName') or b['name'] for b in d['breweries']]
    if areas:
        line2=' · '.join(areas)
    else:
        line2=', '.join(shorts)
        k=len(shorts)
        while len(line2)>118 and k>1:
            k-=1
            line2=', '.join(shorts[:k])+f' and {len(shorts)-k} more'
    top='pourguide<span>.</span>beer' if L.get('showPourguideAbove') else ''
    url=L['url'].replace('https://','')
    pages[loc]=page(top, L['wordmark'], glasses(taps), f"What’s on tap, food trucks and events at {n} breweries.", line2, url)
pages['index']=page('', 'pourguide<span>.</span>beer', glasses(all_taps,30), 'Local brewery guides: what’s on tap, which food trucks are parked, and what’s happening tonight.', ' · '.join(names), 'pourguide.beer')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for k,h in pages.items():
            f=os.path.join(OUT,f'{k}.html'); open(f,'w').write(h)
            pg=await b.new_page(viewport={'width':1200,'height':630})
            await pg.goto('file://'+f); await pg.wait_for_selector('body[data-ready]',timeout=15000); await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(OUT,f'{k}.png'))
        await b.close()
asyncio.run(main())
print('ok')
