/* Tuco Video widget: one script for every layout, driven by the Customizations saved in the admin.
   <div data-tuco-video data-widget="wgt_xxx"></div>  (optional data-product="handle")
   <script src=".../widget.js" data-api="https://YOUR-WORKER" defer></script>
   Everything renders in Shadow DOM so theme CSS cannot break the layout. */
(function () {
  if (window.__tucoLoaded) return;
  window.__tucoLoaded = true;
  var script = document.currentScript;
  var API = (script && script.getAttribute('data-api')) || window.TUCO_VIDEO_API || 'https://tuco-video-api.tucokids.workers.dev';
  // In the theme editor, show why a widget is empty; on the live store, stay hidden.
  function note(el, msg) {
    if (window.Shopify && window.Shopify.designMode) {
      var r = el.shadowRoot || el.attachShadow({ mode: 'open' });
      el.style.display = '';
      r.innerHTML = '<p style="font:12px sans-serif;color:#b42318;background:#fef3f2;border:1px solid #fee4e2;padding:10px 12px;border-radius:8px;margin:8px 16px">Loopy: ' + esc(msg) + '</p>';
    } else el.style.display = 'none';
    if (window.console) console.warn('[Loopy] ' + msg);
  }
  // Some themes hide empty divs (div:empty {display:none}); a hidden child keeps the host visible.
  function keepAlive(el) { if (!el.firstChild) { var m = document.createElement('span'); m.hidden = true; el.appendChild(m); } }
  var isMobile = function () { return window.matchMedia('(max-width: 749px)').matches; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // Only web addresses and site-relative paths are allowed in links and media (blocks javascript: and data: values).
  var safeUrl = function (u) { u = String(u || '').trim(); return /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : ''; };
  var U = function (u) { return esc(safeUrl(u)); };
  var clean = function (x) { return String(x).replace(/[;{}<>\\]/g, ''); };
  // YouTube links play in an embedded player and use the YouTube thumbnail on tiles.
  var ytId = function (u) { var m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/); return m ? m[1] : ''; };
  var ytEmbed = function (id, controls, quiet) { return 'https://www.youtube.com/embed/' + id + '?autoplay=1&mute=1&loop=1&playlist=' + id + '&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&controls=' + (controls ? 1 : 0) + (quiet ? '&disablekb=1&fs=0&iv_load_policy=3' : ''); };
  // A YouTube tile plays inline (muted, looping) once visible; the thumbnail shows until it loads and the cover keeps taps on the tile.
  var ytTile = function (v) { return '<img class="th" data-yt="1" data-id="' + esc(v.id) + '" src="' + U(thumbOf(v)) + '" alt="" loading="lazy"><iframe class="ytv" data-yt="' + ytId(v.url) + '" tabindex="-1" allow="autoplay; encrypted-media" title=""></iframe><span class="cover"></span>'; };
  var thumbOf = function (v) { var id = ytId(v.url); return v.poster || (id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : ''); };

  /* ---------- styles ---------- */
  var BASE = [
    ':host{display:block;width:100%;min-width:min(300px,100vw);font-family:var(--font),system-ui,sans-serif;color:#222}*{box-sizing:border-box}[hidden]{display:none!important}',
    '.carousel,.stories,.banner{width:100%;min-width:0}',
    '.head{text-align:center;margin:0 auto 14px;padding:0 16px}.title{font-size:28px;margin:0;color:var(--head-color);font-family:var(--head-font),var(--font),sans-serif;font-weight:var(--head-weight)}',
    '.track{display:flex;gap:12px;overflow-x:auto;padding:4px 16px 8px;scroll-snap-type:x proximity;scrollbar-width:none}.track::-webkit-scrollbar{display:none}',
    '.card{flex:0 0 var(--tw,190px);scroll-snap-align:start;display:flex;flex-direction:column;gap:8px}',
    '.tile{position:relative;width:100%;aspect-ratio:var(--tar,9/16);border:0;padding:0;border-radius:var(--radius);overflow:hidden;background:#f3f3f3;cursor:pointer;display:block}',
    '.tile video,.tile img.th{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--focus,center);display:block}',
    '.fitc .tile video,.fitc .tile img.th{object-fit:contain}.fitc .ytv{width:100cqw;height:56.25cqw}.focus-top .ytv{top:0;transform:translateX(-50%)}.focus-bottom .ytv{top:auto;bottom:0;transform:translateX(-50%)}',
    '.tile{container-type:size}.ytv{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:max(100cqw,177.78cqh);height:max(100cqh,56.25cqw);border:0;pointer-events:none;z-index:1;background:transparent}.cover{position:absolute;inset:0;z-index:2}',
    '.ov{position:absolute;width:var(--ov-size);height:auto;z-index:2;pointer-events:none}.ov.bottom-right{right:6px;bottom:6px}.ov.bottom-left{left:6px;bottom:6px}.ov.top-right{right:6px;top:6px}.ov.top-left{left:6px;top:6px}',
    '.views{position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.55);color:#fff;font-size:11px;border-radius:999px;padding:3px 8px}',
    '.sold{position:absolute;top:8px;right:8px;z-index:2;background:#fff;color:#222;font-size:11px;font-weight:600;border-radius:999px;padding:3px 8px}',
    '.info{z-index:3;position:absolute;left:0;right:0;bottom:0;padding:26px 10px 10px;color:#fff;text-align:left;font-size:12px;line-height:1.3;background:linear-gradient(transparent,rgba(0,0,0,.65))}',
    '.info b{display:block;font-size:13px}.meta{font-size:12px;line-height:1.3;color:var(--details-color)}.meta b{display:block;font-size:13px;font-weight:600}',
    '.abtn{border:0;cursor:pointer;border-radius:var(--btn-radius);background:var(--brand);color:#222;font:600 11px var(--font),system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:9px 10px;width:100%}.abtn[disabled]{opacity:.6;cursor:default}',
    '.abtn.hov{opacity:0;transition:opacity .15s}.card:hover .abtn.hov{opacity:1}',
    '.chip{position:absolute;left:8px;bottom:8px;z-index:2;background:#fff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600}',
    '.stories .track{gap:calc(14px * var(--spacing))}.stories .card{flex:0 0 calc(84px * var(--size));text-align:center;gap:6px}',
    '.stories .tile{aspect-ratio:1;border-radius:50%;border:3px solid var(--story-border)}.stories .tile img.th,.stories .tile video{border-radius:50%}',
    '.lbl{font-size:12px;color:var(--story-title);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.banner .track{padding:0;gap:0;scroll-snap-type:x mandatory;width:100%}.banner .card{flex:0 0 100%;min-width:100%}.banner .tile{border-radius:0;aspect-ratio:var(--ar);background:var(--bbg,#f3f3f3)}.banner.fixed .tile{aspect-ratio:auto;height:var(--bh)}',
    '.banner.full .tile{aspect-ratio:auto;height:100vh;height:100svh}',
    '.cta{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:3;background:var(--brand);color:#222;border-radius:var(--btn-radius);font:600 13px var(--font),sans-serif;padding:11px 24px}',
    '.rail{position:relative}.arr{position:absolute;top:calc(50% - 18px);z-index:6;width:36px;height:36px;border-radius:50%;border:0;background:#fff;color:#222;font-size:22px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;display:none}.arr.prev{left:6px}.arr.next{right:6px}@media(hover:hover){.arr.show{display:block}}.stories .arr{top:calc(42px * var(--size) - 18px)}',
    '.dots{display:flex;gap:6px;justify-content:center;padding:8px}.dots i{width:6px;height:6px;border-radius:50%;background:#d4d4d8}.dots i.on{background:#222}',
    '.fl .tile{aspect-ratio:9/16}','.fl{position:fixed;bottom:var(--ob,16px);z-index:2147482000;width:calc(110px * var(--size))}.fl.right{right:16px}.fl.left{left:16px}.fl .tile{width:100%}',
    '.fl.mini{width:calc(64px * var(--size))}.fx{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;font-size:11px;z-index:3}',
    '.gal{position:relative;width:100%;aspect-ratio:1/1;border-radius:var(--radius);overflow:hidden;background:#f3f3f3}.gal video{width:100%;height:100%;object-fit:cover;display:block;cursor:pointer}',
    '.snd{position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:15px;cursor:pointer}',
    '.gal iframe{width:100%;height:100%;border:0;display:block}','@media(max-width:749px){.title{font-size:22px}.fl{width:calc(92px * var(--size))}}'
  ].join('');

  var PLAYER = [
    ':host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}.m{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.93);font-family:var(--font),system-ui,sans-serif}',
    '.reel{height:100%;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;overscroll-behavior:contain}.reel::-webkit-scrollbar{display:none}',
    '.slide{position:relative;height:100%;scroll-snap-align:start;scroll-snap-stop:always;display:flex;justify-content:center}',
    '.slide video,.slide iframe{height:100%;width:100%;max-width:480px;object-fit:contain;background:#000;border:0}',
    '.ui{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;padding:24px 16px calc(20px + env(safe-area-inset-bottom));color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.78))}',
    '.t{margin:0 0 8px;font-weight:600;font-size:15px}.plist{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.plist::-webkit-scrollbar{display:none}',
    '.p{flex:0 0 100%;scroll-snap-align:start;display:flex;align-items:center;gap:10px;background:#fff;color:#222;border-radius:var(--radius);padding:8px}.plist.many .p{flex-basis:88%}',
    '.p img{width:52px;height:52px;object-fit:cover;border-radius:8px;flex:none;background:#f3f3f3}.pm{flex:1;min-width:0;font-size:13px;line-height:1.3}.pm b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pm a{color:#666;font-size:11px;text-decoration:underline}.atc{border:0;border-radius:var(--btn-radius);background:var(--brand);color:#222;font:600 12px var(--font),sans-serif;padding:10px 14px;cursor:pointer;white-space:nowrap}.atc[disabled]{opacity:.6}',
    '.b{position:absolute;z-index:3;top:calc(12px + env(safe-area-inset-top));width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer}.x{right:12px}.s{right:60px}',
    '.side{position:absolute;right:12px;bottom:170px;display:flex;flex-direction:column;gap:10px;z-index:3}.side button{width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:17px;cursor:pointer}'
  ].join('');

  /* ---------- helpers ---------- */
  var pcache = {};
  function getProduct(handle) {
    if (!handle) return Promise.resolve(null);
    if (!pcache[handle]) pcache[handle] = fetch('/products/' + encodeURIComponent(handle) + '.js').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return pcache[handle];
  }
  function money(cents) {
    var cur = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'INR';
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(cents / 100); } catch (e) { return ''; }
  }
  // Traffic source: utm_source, else the referring site, remembered for the visit.
  function trafficSrc() {
    try {
      var s = sessionStorage.getItem('tuco_src');
      if (s) return s;
      var u = new URLSearchParams(location.search).get('utm_source');
      var ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
      s = u || (ref && ref !== location.hostname.replace(/^www\./, '') ? ref : 'direct');
      sessionStorage.setItem('tuco_src', s);
      return s;
    } catch (err) { return 'direct'; }
  }
  // Events are queued and sent in small batches (fewer requests and database writes); impressions count once per page view.
  var Q = [], seen = {}, flushTimer = 0;
  function sendQ() {
    clearTimeout(flushTimer); flushTimer = 0;
    if (!Q.length) return;
    var body = JSON.stringify(Q.splice(0, 50));
    try { fetch(API + '/api/public/events', { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(function () {}); } catch (err) { /* ignore */ }
    if (Q.length) sendQ();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sendQ(); });
  window.addEventListener('pagehide', sendQ);
  function track(ctx, e) {
    if (ctx.preview || !API) return;
    if (e.type === 'watch' && !(e.secs >= 1)) return;
    e.widget = ctx.widgetId || '';
    e.device = isMobile() ? 'mobile' : 'desktop';
    e.src = trafficSrc();
    if (e.type === 'impression') { var k = e.widget + '|' + e.videoId; if (seen[k]) return; seen[k] = 1; }
    Q.push(e);
    if (Q.length >= 20) sendQ(); else if (!flushTimer) flushTimer = setTimeout(sendQ, 4000);
  }
  function fmtViews(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }

  // Adds to the real cart; refreshes the theme cart drawer, or goes to the cart page per settings.
  function addToCart(ctx, variantId) {
    if (ctx.preview) return Promise.resolve();
    var fd = new FormData();
    fd.append('id', variantId); fd.append('quantity', '1');
    fd.append('properties[_tuco_video]', ctx.lastVideo || '');
    fd.append('sections', 'cart-drawer,cart-icon-bubble'); fd.append('sections_url', window.location.pathname);
    return fetch('/cart/add.js', { method: 'POST', body: fd, headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('add failed');
      return r.json();
    }).then(function (state) {
      if (ctx.settings.cartAction === 'cart_page') { window.location.href = '/cart'; return; }
      var drawer = document.querySelector('cart-drawer');
      if (drawer && drawer.renderContents && state.sections) drawer.renderContents(state);
    });
  }

  function cssVars(s, extra, mobile) {
    if (mobile === undefined) mobile = isMobile();
    var c = s.carousel, st = s.stories, b = s.banner, sp = s.spotlight || {}, round = s.border !== 'square';
    var num = function (x, d) { return typeof x === 'number' && !isNaN(x) ? x : d; };
    var v = {
      '--brand': s.brandColor, '--font': s.brandFont || 'Poppins', '--radius': round ? '16px' : '4px', '--btn-radius': round ? '999px' : '4px',
      '--head-color': c.headingColor, '--head-font': c.headingFont || s.brandFont || 'Poppins', '--head-weight': c.headingWeight, '--details-color': c.detailsColor,
      '--feed-bg': c.feedAtcColor, '--feed-fg': c.feedAtcTextColor, '--ov-size': c.overlaySize + '%',
      '--tw': (mobile ? (c.tileWidthMobile || 160) : (c.tileWidthDesktop || 220)) + 'px', '--tar': String(c.tileAspect || '9/16').replace(':', '/'), '--focus': { top: 'center top', bottom: 'center bottom' }[b.focus] || 'center', '--bh': (mobile ? (b.mobileHeight || 480) : (b.desktopHeight || 520)) + 'px', '--bbg': b.background || '#f3f3f3', '--ob': (mobile ? num(sp.bottomOffsetMobile, 84) : num(sp.bottomOffsetDesktop, 20)) + 'px',
      '--story-border': st.borderColor, '--story-title': st.titleColor, '--size': st.sizeFactor, '--spacing': st.spacing
    };
    Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
    return ':host{' + Object.keys(v).map(function (k) { return k + ':' + clean(v[k]); }).join(';') + '}';
  }

  // Loads live product data, fills prices and images, and drops sold-out videos per the settings.
  function prepare(ctx, videos) {
    if (ctx.preview) return Promise.resolve(videos);
    var out = [];
    // The API already supplies live price, image, stock and variant, so no per-product store requests are needed.
    var inr = !(window.Shopify && window.Shopify.currency && window.Shopify.currency.active && window.Shopify.currency.active !== 'INR');
    if (inr && videos.every(function (v) { return v.products.every(function (p) { return p.live; }); })) {
      videos.forEach(function (v) {
        v.allSoldOut = v.products.length > 0 && v.products.every(function (p) { return p.soldOut; });
        if (!(v.allSoldOut && !ctx.settings.oos.showWhenAllOut)) out.push(v);
      });
      return Promise.resolve(out);
    }
    return Promise.all(videos.map(function (v) {
      return Promise.all(v.products.map(function (p) { return getProduct(p.handle); })).then(function (ps) {
        v.products.forEach(function (p, i) {
          var d = ps[i];
          if (!d) return;
          var av = d.variants.filter(function (x) { return x.available; })[0];
          p.soldOut = !av; p.price = money((av || d.variants[0]).price); p.image = d.featured_image || p.image; p.title = d.title; p.variantId = av && av.id;
        });
        v.allSoldOut = v.products.length > 0 && v.products.every(function (p) { return p.soldOut; });
      });
    })).then(function () {
      videos.forEach(function (v) { if (!(v.allSoldOut && !ctx.settings.oos.showWhenAllOut)) out.push(v); });
      return out;
    });
  }

  /* ---------- fullscreen player ---------- */
  function openPlayer(ctx, videos, start) {
    var s = ctx.settings;
    var host = document.createElement('div');
    keepAlive(host);
    host.style.setProperty('display', 'block', 'important');
    var root = host.attachShadow({ mode: 'open' });
    var muted = true;
    var productRow = function (p, cta) {
      var oos = p.soldOut;
      return '<div class="p">' + '<img alt="" src="' + U(p.image) + '"><div class="pm"><b>' + esc(p.title) + '</b>' + (s.showPrice ? '<span>' + esc(p.price || '') + '</span> ' : '') +
        '<a href="' + esc(safeUrl(cta.url) || ('/products/' + encodeURIComponent(p.handle))) + '">' + esc(cta.text || s.shopNowText) + '</a></div>' + (s.showAtc ? '<button class="atc"' + (oos ? ' disabled' : '') + '>' + (oos ? 'Sold out' : 'Add to cart') + '</button>' : '') + '</div>';
    };
    root.innerHTML = '<style>' + cssVars(s) + PLAYER + '</style><div class="m" role="dialog" aria-modal="true" aria-label="Video player"><button class="b x" aria-label="Close">✕</button><button class="b s" aria-label="Sound">🔇</button><div class="reel">' +
      videos.map(function (v) {
        return '<div class="slide" data-id="' + esc(v.id) + '">' + (ytId(v.url) ? '<iframe data-yt="' + ytId(v.url) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' : '<video src="' + U(v.url) + '" muted loop playsinline></video>') + '<div class="side"><button class="like" aria-label="Like">♡</button><button class="share" aria-label="Share">↗</button></div><div class="ui"><p class="t">' + esc(v.title) +
          '</p><div class="plist' + (v.products.length > 1 ? ' many' : '') + '">' + v.products.map(function (p) { return productRow(p, { text: v.ctaText, url: v.ctaUrl }); }).join('') + '</div></div></div>';
      }).join('') + '</div></div>';
    document.body.appendChild(host);
    var opener = document.activeElement, pushed = false;
    try { history.pushState({ tucoPlayer: 1 }, ''); pushed = true; } catch (err) { /* ignore */ }
    var prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    var reel = root.querySelector('.reel'), slides = [].slice.call(reel.children), watch = {};

    slides.forEach(function (sl, i) {
      var v = videos[i];
      [].slice.call(sl.querySelectorAll('.p')).forEach(function (row, j) {
        var p = v.products[j], btn = row.querySelector('.atc');
        if (!btn || p.soldOut) return;
        btn.onclick = function () {
          btn.disabled = true; btn.textContent = 'Adding...';
          ctx.lastVideo = v.id;
          var done = function () { btn.textContent = 'Added ✓'; track(ctx, { type: 'atc', videoId: v.id, product: p.handle }); };
          if (ctx.preview) return done();
          var go = p.variantId ? Promise.resolve(p.variantId) : getProduct(p.handle).then(function (d) { var a = d && d.variants.filter(function (x) { return x.available; })[0]; return a && a.id; });
          go.then(function (id) { if (!id) throw new Error('no variant'); return addToCart(ctx, id); }).then(done).catch(function () { window.location.href = '/products/' + p.handle; });
        };
      });
      sl.querySelector('.like').onclick = function (e) { e.currentTarget.textContent = '♥'; track(ctx, { type: 'like', videoId: v.id }); };
      sl.querySelector('.share').onclick = function () {
        var link = location.origin + '/products/' + (v.products[0] ? v.products[0].handle : '');
        track(ctx, { type: 'share', videoId: v.id });
        if (navigator.share) navigator.share({ title: v.title, url: link }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(link);
      };
    });
    function flush(id) { if (watch[id]) { track(ctx, { type: 'watch', videoId: id, secs: (Date.now() - watch[id]) / 1000 }); delete watch[id]; } }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var vid = e.target.querySelector('video'), fr = e.target.querySelector('iframe'), id = e.target.getAttribute('data-id');
        if (e.isIntersecting) {
          if (vid) { vid.muted = muted; vid.play().catch(function () {}); }
          if (fr) fr.src = ytEmbed(fr.getAttribute('data-yt'), false);
          watch[id] = Date.now(); track(ctx, { type: 'play', videoId: id });
        } else { if (vid) vid.pause(); if (fr) fr.removeAttribute('src'); flush(id); }
      });
    }, { root: reel, threshold: 0.7 });
    slides.forEach(function (sl) { io.observe(sl); });
    if (slides[start]) slides[start].scrollIntoView();
    // The phone's back button closes the player instead of leaving the page.
    var closed = false;
    function close(fromPop) {
      if (closed) return;
      closed = true;
      Object.keys(watch).forEach(flush); io.disconnect(); host.remove();
      document.documentElement.style.overflow = prev;
      document.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop);
      if (pushed && fromPop !== true && history.state && history.state.tucoPlayer) history.back();
      try { if (opener && opener.focus) opener.focus(); } catch (err) { /* ignore */ }
    }
    function onPop() { close(true); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') reel.scrollBy({ top: reel.clientHeight, behavior: 'smooth' });
      else if (e.key === 'ArrowUp') reel.scrollBy({ top: -reel.clientHeight, behavior: 'smooth' });
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    root.querySelector('.x').onclick = function () { close(); };
    try { root.querySelector('.x').focus(); } catch (err) { /* ignore */ }
    root.querySelector('.s').onclick = function (e) { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; slides.forEach(function (sl) {
        var vv = sl.querySelector('video'), f = sl.querySelector('iframe');
        if (vv) vv.muted = muted;
        if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*');
      });
    };
  }

  /* ---------- tiles ---------- */
  // Respect reduced-motion and data-saver: show posters only, load video when tapped.
  var calm = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || !!(navigator.connection && navigator.connection.saveData);
  function lazyVideos(root, ctx) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var vid = e.target;
        if (e.isIntersecting) {
          if (vid.tagName === 'VIDEO' && !calm) { if (!vid.src) vid.src = vid.getAttribute('data-src') + '#t=0.1'; vid.play().catch(function () {}); }
          if (vid.tagName === 'IMG' && !calm) { var fr = vid.nextElementSibling; if (fr && fr.tagName === 'IFRAME' && !fr.getAttribute('src')) fr.src = ytEmbed(fr.getAttribute('data-yt'), false, true); }
          if (!vid.__seen) { vid.__seen = 1; track(ctx, { type: 'impression', videoId: vid.getAttribute('data-id') }); }
        } else if (vid.tagName === 'VIDEO') vid.pause();
        else if (vid.tagName === 'IMG') { var f2 = vid.nextElementSibling; if (f2 && f2.tagName === 'IFRAME') f2.removeAttribute('src'); }
      });
    }, { rootMargin: '200px' });
    [].slice.call(root.querySelectorAll('video[data-src], img[data-yt]')).forEach(function (v) { io.observe(v); });
  }

  function tileHTML(v, i, s, type) {
    var c = s.carousel, p = v.products[0], tt = s.tileType;
    var yt = ytId(v.url), tsrc = thumbOf(v);
    var thumb = yt ? ytTile(v) : ((tsrc ? '<img class="th" src="' + U(tsrc) + '" alt="" loading="lazy">' : '') + '<video data-id="' + esc(v.id) + '" data-src="' + U(v.url) + '" muted loop playsinline preload="none"></video>');
    var ov = c.overlayImage ? '<img class="ov ' + esc(c.overlayPlacement) + '" src="' + U(c.overlayImage) + '" alt="">' : '';
    var views = s.showViews ? '<span class="views">▶ ' + fmtViews(v.views || 0) + '</span>' : '';
    var sold = v.allSoldOut && s.oos.soldOutLabel ? '<span class="sold">Sold out</span>' : '';
    var priceTxt = p && s.showPrice ? '<b>' + esc(p.price || '') + '</b>' : '';
    var inner = thumb + ov + views + sold;
    var open = function (body) { return '<button class="tile" data-i="' + i + '" aria-label="' + esc(v.title) + '">' + body + '</button>'; };
    if (type === 'stories') return '<div class="card">' + open(thumb) + '<span class="lbl">' + esc(v.title) + '</span></div>';
    if (type === 'banner') return '<div class="card">' + open(inner + (s.banner.showCta && p ? '<span class="cta">' + esc(v.ctaText || s.shopNowText) + '</span>' : '')) + '</div>';
    if (tt === 'below') {
      var atc = c.showAtcBelow && s.showAtc && p && !v.allSoldOut ? '<button class="abtn ' + (c.showAtcHover ? 'hov' : '') + '" data-atc="' + i + '">Add to cart</button>' : '';
      return '<div class="card">' + open(inner) + '<div class="meta">' + (p ? '<b>' + esc(p.title) + '</b>' + priceTxt : '') + '</div>' + atc + '</div>';
    }
    if (tt === 'feed') {
      var fatc = s.showAtc && p && !v.allSoldOut ? '<span class="cta" style="bottom:8px;background:' + esc(c.feedAtcColor) + ';color:' + esc(c.feedAtcTextColor) + ';font-size:11px;padding:8px 16px">Add to cart</span>' : '';
      return '<div class="card">' + open(inner + '<span class="info" style="padding-bottom:44px">' + (p ? '<b>' + esc(p.title) + '</b>' : '') + priceTxt + '</span>' + fatc) + '</div>';
    }
    if (tt === 'minimal') return '<div class="card">' + open(inner + (p ? '<span class="chip">' + (s.showPrice ? esc(p.price || '') : esc(p.title)) + '</span>' : '')) + '</div>';
    return '<div class="card">' + open(inner + '<span class="info">' + (p ? '<b>' + esc(p.title) + '</b>' : '') + priceTxt + '</span>') + '</div>';
  }

  function wire(root, ctx, list) {
    [].slice.call(root.querySelectorAll('.tile[data-i]')).forEach(function (t) { t.addEventListener('click', function () { openPlayer(ctx, list, Number(t.getAttribute('data-i'))); }); });
    [].slice.call(root.querySelectorAll('[data-atc]')).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var v = list[Number(b.getAttribute('data-atc'))], p = v.products[0];
        ctx.lastVideo = v.id; b.disabled = true; b.textContent = 'Adding...';
        var done = function () { b.textContent = 'Added ✓'; track(ctx, { type: 'atc', videoId: v.id, product: p.handle }); };
        if (ctx.preview) return done();
        addToCart(ctx, p.variantId).then(done).catch(function () { window.location.href = '/products/' + p.handle; });
      });
    });
  }

  /* ---------- layouts ---------- */
  function renderRow(el, ctx, list, type) {
    var s = ctx.settings, w = ctx.widget || {};
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var banner = type === 'banner';
    var ar = (ctx.mobile ? s.banner.aspectPortrait : s.banner.aspectLandscape) || '16/9';
    var fit = banner ? s.banner.fit : s.carousel.tileFit;
    var cls = type + (banner && s.banner.fullScreen ? ' full' : '') + (banner && s.banner.heightMode === 'fixed' && !s.banner.fullScreen ? ' fixed' : '') + (fit === 'contain' ? ' fitc' : '') + (banner ? ' focus-' + (s.banner.focus || 'center') : '');
    var head = w.heading && !banner ? '<div class="head"><h2 class="title">' + esc(w.heading) + '</h2></div>' : '';
    root.innerHTML = '<style>' + cssVars(s, { '--ar': ar.replace(':', '/') }, ctx.mobile) + BASE + '</style><div class="' + cls + '">' + head + '<div class="rail"><div class="track">' + list.map(function (v, i) { return tileHTML(v, i, s, type); }).join('') + '</div><button class="arr prev" aria-label="Previous">&#8249;</button><button class="arr next" aria-label="Next">&#8250;</button></div>' +
      (banner && s.banner.showDots && list.length > 1 ? '<div class="dots">' + list.map(function (_, i) { return '<i class="' + (i ? '' : 'on') + '"></i>'; }).join('') + '</div>' : '') + '</div>';
    lazyVideos(root, ctx);
    wire(root, ctx, list);
    // Desktop mouse users get prev/next arrows; touch devices just swipe.
    (function () {
      var tr = root.querySelector('.track'), prev = root.querySelector('.arr.prev'), next = root.querySelector('.arr.next');
      function upd() { prev.classList.toggle('show', tr.scrollLeft > 4); next.classList.toggle('show', tr.scrollLeft + tr.clientWidth < tr.scrollWidth - 4); }
      prev.onclick = function () { tr.scrollBy({ left: -tr.clientWidth * 0.8, behavior: 'smooth' }); };
      next.onclick = function () { tr.scrollBy({ left: tr.clientWidth * 0.8, behavior: 'smooth' }); };
      tr.addEventListener('scroll', upd, { passive: true });
      window.addEventListener('resize', upd);
      setTimeout(upd, 300);
    })();
    if (banner && list.length > 1) {
      var tr = root.querySelector('.track'), dots = [].slice.call(root.querySelectorAll('.dots i'));
      tr.addEventListener('scroll', function () { var i = Math.round(tr.scrollLeft / tr.clientWidth); dots.forEach(function (d, k) { d.className = k === i ? 'on' : ''; }); });
    }
  }

  // Corner video used for both Spotlight and the product-page Floating widget.
  function renderCorner(el, ctx, list, type) {
    var s = ctx.settings;
    var cfg = type === 'spotlight' ? s.spotlight : { position: 'right', sizeFactor: 1, ultraMinimize: s.product.ultraMinimize, enabled: true };
    if (!cfg.enabled) { el.style.display = 'none'; return; }
    try { if (!ctx.preview && sessionStorage.getItem('tuco_float_closed_' + type)) { el.style.display = 'none'; return; } } catch (e) { /* ignore */ }
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var v = list[0];
    root.innerHTML = '<style>' + cssVars(s, { '--size': cfg.sizeFactor }) + BASE + '</style><div class="fl ' + (cfg.position === 'left' ? 'left' : 'right') + '"><button class="tile" data-i="0" aria-label="' + esc(v.title) + '">' + (ytId(v.url) ? ytTile(v) : '<video data-id="' + esc(v.id) + '" data-src="' + U(v.url) + '" muted loop playsinline preload="none"' + (v.poster ? ' poster="' + U(v.poster) + '"' : '') + '></video>') + '</button><button class="fx" aria-label="Close">✕</button></div>';
    lazyVideos(root, ctx);
    wire(root, ctx, list);
    var box = root.querySelector('.fl');
    root.querySelector('.fx').onclick = function (e) { e.stopPropagation(); try { sessionStorage.setItem('tuco_float_closed_' + type, '1'); } catch (err) { /* ignore */ } el.style.display = 'none'; };
    if (cfg.ultraMinimize && !ctx.preview) window.addEventListener('scroll', function () { box.classList.toggle('mini', window.scrollY > 200); }, { passive: true });
  }

  // Product-page gallery video: plays inline, optionally inserted into the theme gallery.
  function renderGallery(el, ctx, list) {
    var sel = el.getAttribute('data-insert-into'), target = sel && document.querySelector(sel);
    if (target && !ctx.preview) {
      var holder = /^(UL|OL)$/.test(target.tagName) ? document.createElement('li') : el;
      if (holder !== el) { holder.className = target.firstElementChild ? target.firstElementChild.className : ''; holder.appendChild(el); }
      if (el.getAttribute('data-insert-position') === 'last') target.appendChild(holder); else target.insertBefore(holder, target.firstChild);
    }
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' }), v = list[0];
    if (ytId(v.url)) {
      root.innerHTML = '<style>' + cssVars(ctx.settings) + BASE + '</style><div class="gal"><iframe src="' + ytEmbed(ytId(v.url), true) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
      track(ctx, { type: 'play', videoId: v.id });
      return;
    }
    root.innerHTML = '<style>' + cssVars(ctx.settings) + BASE + '</style><div class="gal"><video data-src="' + U(v.url) + '" muted loop playsinline preload="none"' + (v.poster ? ' poster="' + U(v.poster) + '"' : '') + '></video><button class="snd" aria-label="Sound">🔇</button></div>';
    var vid = root.querySelector('video'), btn = root.querySelector('.snd'), started = 0, counted = false;
    var toggle = function () { vid.muted = !vid.muted; btn.textContent = vid.muted ? '🔇' : '🔊'; };
    btn.onclick = toggle; vid.onclick = toggle;
    function flush() { if (started) { track(ctx, { type: 'watch', videoId: v.id, secs: (Date.now() - started) / 1000 }); started = 0; } }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { if (!vid.src) vid.src = vid.getAttribute('data-src') + '#t=0.1'; vid.play().catch(function () {}); started = Date.now(); if (!counted) { counted = true; track(ctx, { type: 'play', videoId: v.id }); } }
        else { vid.pause(); flush(); }
      });
    }, { rootMargin: '100px' }).observe(vid);
    window.addEventListener('pagehide', flush);
  }

  // Per-embed overrides from data attributes (set by the Loopy Video theme section). They win over the widget's own settings.
  function applyAttrOverrides(s, el) {
    var out = JSON.parse(JSON.stringify(s));
    var g = function (n) { var v = el.getAttribute(n); return v == null ? '' : String(v).trim(); };
    var num = function (n, lo, hi) { var v = parseFloat(g(n)); return isFinite(v) && v >= lo && v <= hi ? v : null; };
    var bd = num('data-banner-h-desktop', 100, 1400), bm = num('data-banner-h-mobile', 100, 1200);
    if (bd !== null || bm !== null) { out.banner.heightMode = 'fixed'; if (bd !== null) out.banner.desktopHeight = bd; if (bm !== null) out.banner.mobileHeight = bm; }
    var bf = g('data-banner-fit'); if (bf === 'cover' || bf === 'contain') out.banner.fit = bf;
    var td = num('data-tile-w-desktop', 60, 700), tm = num('data-tile-w-mobile', 60, 500);
    if (td !== null) out.carousel.tileWidthDesktop = td;
    if (tm !== null) out.carousel.tileWidthMobile = tm;
    var sh = g('data-tile-shape'); if (/^\d{1,2}\/\d{1,2}$/.test(sh)) out.carousel.tileAspect = sh;
    var tf = g('data-tile-fit'); if (tf === 'cover' || tf === 'contain') out.carousel.tileFit = tf;
    return out;
  }

  /* ---------- entry points ---------- */
  function render(el, cfg, opts) {
    opts = opts || {};
    keepAlive(el);
    var type = (cfg.widget && cfg.widget.type) || el.getAttribute('data-layout') || 'carousel';
    var ctx = { settings: cfg.settings, widget: cfg.widget, widgetId: cfg.widget ? cfg.widget.id : '', preview: !!opts.preview, mobile: opts.device ? opts.device === 'mobile' : isMobile() };
    return prepare(ctx, cfg.videos || []).then(function (list) {
      if (!list.length) {
        if (opts.preview) { var r = el.shadowRoot || el.attachShadow({ mode: 'open' }); r.innerHTML = '<style>' + BASE + '</style><p style="text-align:center;color:#999;font:13px sans-serif;padding:24px">No videos to show yet.</p>'; } else note(el, 'no live videos to show for this widget. Check the video is live and (for tagged widgets) has a product.');
        return;
      }
      el.style.setProperty('display', 'block', 'important');
      if (type === 'floating' || type === 'spotlight') return renderCorner(el, ctx, list, type);
      if (type === 'gallery') return renderGallery(el, ctx, list.slice(0, 1));
      renderRow(el, ctx, type === 'banner' ? list.slice(0, 8) : list.slice(0, 40), type === 'stories' || type === 'banner' ? type : 'carousel');
    });
  }
  window.TucoVideo = { render: render };

  function init(el) {
    if (el.__tuco || !API) return;
    el.__tuco = true;
    keepAlive(el);
    var q = [];
    var wid = el.getAttribute('data-widget');
    if (wid) q.push('widget=' + encodeURIComponent(wid));
    var cm = location.pathname.match(/\/collections\/([^/?#]+)(?:\/products\/[^/?#]+)?$/);
    var coll = el.getAttribute('data-collection') || (cm && cm[1]);
    if (coll) q.push('collection=' + encodeURIComponent(coll));
    var pm = location.pathname.match(/\/pages\/([^/?#]+)/);
    var pg = el.getAttribute('data-page') || (pm && pm[1]);
    if (pg) q.push('page=' + encodeURIComponent(pg));
    var m = location.pathname.match(/\/products\/([^/?#]+)/);
    var product = el.getAttribute('data-product') || (m && m[1]);
    if (product) q.push('product=' + encodeURIComponent(product));
    ['placement', 'audience'].forEach(function (k) { var v = el.getAttribute('data-' + k); if (v) q.push(k + '=' + encodeURIComponent(v)); });
    // Reserve the height this widget had last time so the page does not jump when it appears.
    var hk = 'tuco_h_' + (wid || 'x') + (isMobile() ? 'm' : 'd');
    try { var hh = Number(localStorage.getItem(hk)); if (hh > 40) el.style.minHeight = hh + 'px'; } catch (err) { /* ignore */ }
    function settle(ok) {
      el.style.minHeight = '';
      if (ok) { try { var h = el.offsetHeight; if (h > 40) localStorage.setItem(hk, String(h)); } catch (err) { /* ignore */ } }
    }
    var url = API + '/api/public/config?' + q.join('&');
    // 8 second timeout, one retry, so a slow or failing API never hangs the page.
    function load(attempt) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : 0;
      return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (e) { clearTimeout(t); if (attempt < 1) return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return load(attempt + 1); }); throw e; });
    }
    load(0).then(function (cfg) {
      if (!cfg.widget && wid) { settle(false); note(el, 'widget ' + wid + ' was not found or is switched off in Loopy.'); return; }
      if (el.getAttribute('data-heading') && cfg.widget) cfg.widget.heading = el.getAttribute('data-heading');
      cfg.settings = applyAttrOverrides(cfg.settings, el);
      return render(el, cfg).then(function () { settle(true); });
    }).catch(function (e) { settle(false); note(el, 'could not load from ' + API + ' (' + (e && e.message ? e.message : 'network or blocked store address') + ').'); });
  }
  // A bare widget id typed on its own (for example in a Custom Liquid box) becomes a widget.
  function scanBare() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), hits = [], n;
    while ((n = walker.nextNode())) {
      if (/^wgt_[a-z0-9]{4,}$/i.test(n.nodeValue.trim()) && !/^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|TITLE|OPTION)$/.test(n.parentNode.nodeName)) hits.push(n);
    }
    hits.forEach(function (t) {
      var d = document.createElement('div');
      d.setAttribute('data-tuco-video', '');
      d.setAttribute('data-widget', t.nodeValue.trim());
      t.parentNode.replaceChild(d, t);
    });
  }
  function boot() { scanBare(); document.querySelectorAll('[data-tuco-video]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('shopify:section:load', boot);
})();
