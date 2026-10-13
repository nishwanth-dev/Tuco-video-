# Seeds the local test API with clips and one widget of each type, then writes page.html. Run by setup.sh.
import json, urllib.request
B = 'http://localhost:8799'
def call(m, p, body=None, raw=None, ct='application/json'):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(B + p, data=data, method=m, headers={'authorization': 'Bearer testtoken', 'content-type': ct})
    return json.loads(urllib.request.urlopen(r).read() or b'{}')
vids = []
poster = call('PUT', '/api/upload?name=poster1.jpg', raw=open('poster1.jpg', 'rb').read(), ct='image/jpeg')['url']
for i in range(1, 7):
    up = call('PUT', f'/api/upload?name=clip{i}.mp4', raw=open(f'clip{i}.mp4', 'rb').read(), ct='video/mp4')
    v = call('POST', '/api/videos', {'title': f'Clip {i}', 'url': up['url'], 'poster': poster if i == 1 else '', 'audience': 'kids', 'status': 'live', 'placements': ['home', 'product', 'collection', 'pages'], 'size': up['size'], 'products': [{'handle': f'product-{i}', 'title': f'Product {i}', 'price': '₹ 499'}]})
    vids.append(v['id'])
call('POST', '/api/videos', {'title': 'Draft hidden', 'url': 'https://cdn.example.com/x.mp4', 'status': 'draft', 'placements': ['home'], 'products': []})
W = {}
for t in ['carousel', 'stories', 'banner', 'spotlight', 'floating', 'gallery']:
    one = t in ('spotlight', 'floating', 'gallery')
    W[t] = call('POST', '/api/widgets', {'name': f'QA {t}', 'type': t, 'page': 'home', 'scope': 'custom', 'enabled': True, 'videoIds': vids[:1] if one else vids, 'heading': 'Shop the looks' if t in ('carousel', 'stories') else ''})['id']
W['empty'] = call('POST', '/api/widgets', {'name': 'QA empty', 'type': 'carousel', 'page': 'home', 'scope': 'custom', 'enabled': True, 'videoIds': [], 'heading': 'Should stay hidden'})['id']
W['disabled'] = call('POST', '/api/widgets', {'name': 'QA disabled', 'type': 'carousel', 'page': 'home', 'scope': 'custom', 'enabled': False, 'videoIds': vids, 'heading': 'Disabled'})['id']
json.dump(W, open('wids.json', 'w'))
html = '''<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>QA theme page</title>
<style>body{margin:0;font-family:sans-serif;color:#333}div:empty{display:none}header{padding:14px 20px;border-bottom:1px solid #ddd;font-weight:700}section{padding:20px}.product__media-list{display:grid;gap:8px;padding:20px}.product__media-list>div{background:#eee;height:120px}.bottom-bar{position:fixed;bottom:0;left:0;right:0;height:56px;background:#fff;border-top:1px solid #ddd;z-index:50}</style></head><body>
<header>QA theme page (stands in for the store)</header>
<section><h3>Carousel</h3><div data-tuco-video data-widget="%(carousel)s"></div></section>
<section><h3>Stories</h3><div data-tuco-video data-widget="%(stories)s"></div></section>
<section><h3>Banner</h3><div data-tuco-video data-widget="%(banner)s"></div></section>
<section><h3>Empty widget (must stay invisible)</h3><div data-tuco-video data-widget="%(empty)s"></div></section>
<section><h3>Disabled widget (must stay invisible)</h3><div data-tuco-video data-widget="%(disabled)s"></div></section>
<section><h3>Wrong id (must stay invisible)</h3><div data-tuco-video data-widget="wgt_doesnotexist"></div></section>
<section><h3>Gallery target</h3><div class="product__media-list"><div>image 1</div><div>image 2</div></div><div data-tuco-video data-widget="%(gallery)s" data-insert-into=".product__media-list"></div></section>
<section><h3>Spotlight + floating (corner)</h3><div data-tuco-video data-widget="%(spotlight)s"></div><div data-tuco-video data-widget="%(floating)s"></div></section>
<div style="height:600px"></div><div class="bottom-bar">bottom bar</div>
<script src="/widget.js" data-api="http://localhost:8799" defer></script></body></html>''' % W
open('page.html', 'w').write(html)
print('widgets:', W)

# ---- extra scenario pages ----
bad = call('POST', '/api/videos', {'title': 'Broken link video', 'url': 'https://localhost.invalid/missing.mp4', 'status': 'live', 'placements': ['home'], 'products': [{'handle': 'product-9', 'title': 'Product 9', 'price': '₹ 100'}]})['id']
first = call('GET', '/api/videos')['videos']
good = [v for v in first if v['title'] == 'Clip 2'][0]
long = call('POST', '/api/videos', {'title': 'A very long title ' * 12 + 'that must not break the layout', 'url': good['url'], 'status': 'live', 'placements': ['home'], 'products': [{'handle': 'product-10', 'title': 'Extremely long product name ' * 6, 'price': '₹ 12,99,999'}]})['id']
bw = call('POST', '/api/widgets', {'name': 'QA broken', 'type': 'carousel', 'page': 'home', 'scope': 'custom', 'enabled': True, 'videoIds': [bad, long] + vids[:3], 'heading': ''})['id']
CSS = '<style>body{margin:0;font-family:sans-serif}div:empty{display:none}section{padding:12px 20px}</style>'
def page(name, body, api='http://localhost:8799', extra=''):
    open(name, 'w').write(f'<!doctype html><meta charset=utf-8>{CSS}<body>{body}<script src="/widget.js" data-api="{api}" defer></script>{extra}')
page('broken.html', f'<section><div data-tuco-video data-widget="{bw}"></div></section>')
page('dead.html', f'<section>API is down: widget must stay invisible<div data-tuco-video data-widget="{W["carousel"]}"></div></section><p id=ok>page alive</p>', api='http://localhost:9')
page('double.html', f'<section><div data-tuco-video data-widget="{W["carousel"]}"></div></section><section><div data-tuco-video data-widget="{W["carousel"]}"></div></section>', extra='<script src="/widget.js" data-api="http://localhost:8799" defer></script>')
page('bare.html', f'<section><p>{W["carousel"]}</p></section>')
page('late.html', '<section id=slot></section><section id=slot2></section>', extra=f"<script>setTimeout(function(){{document.getElementById('slot').innerHTML='<div data-tuco-video data-widget=\"{W['carousel']}\"></div>'}},1500);setTimeout(function(){{document.getElementById('slot2').innerHTML='<div><p>{W['carousel']}</p></div>'}},2000)</script>")
