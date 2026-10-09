/* Tuco Video widget: drop-in script for the store. Renders inside Shadow DOM so theme CSS cannot break it.
   Usage: <div data-tuco-video data-layout="carousel" data-placement="home"></div>
          <script src=".../widget.js" data-api="https://YOUR-WORKER" defer></script> */
(function () {
  var script = document.currentScript;
  var API = (script && script.getAttribute('data-api')) || window.TUCO_VIDEO_API || '';
  if (!API) return;
  var mobile = function () { return window.matchMedia('(max-width: 749px)').matches; };

  var CSS = [
    ':host{display:block;font-family:Poppins,system-ui,sans-serif}',
    '.head{text-align:center;margin:0 auto 14px;padding:0 16px}.title{font-size:30px;color:#4d4747;margin:0;font-family:\'More Sugar\',Poppins,sans-serif;font-weight:400}',
    '.track{display:flex;gap:12px;overflow-x:auto;padding:4px 16px 8px;scroll-snap-type:x proximity;scrollbar-width:none}.track::-webkit-scrollbar{display:none}',
    '.tile{position:relative;flex:0 0 190px;aspect-ratio:9/16;border:0;padding:0;border-radius:16px;overflow:hidden;background:#f3f3f3;cursor:pointer;scroll-snap-align:start}',
    '.tile video,.tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
    '.info{position:absolute;left:0;right:0;bottom:0;padding:26px 10px 10px;color:#fff;text-align:left;font-size:12px;line-height:1.3;background:linear-gradient(transparent,rgba(0,0,0,.65))}',
    '.stories .track{gap:14px}.stories .item{flex:0 0 84px;text-align:center;font-size:12px;color:#4d4747}',
    '.stories .tile{flex:none;width:84px;aspect-ratio:1;border-radius:50%;border:3px solid #ffd94a}.stories .info{display:none}',
    '.stories .lbl{display:block;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.spotlight .track{justify-content:center}.spotlight .tile{flex-basis:300px}',
    '.banner .tile{flex:1 0 100%;aspect-ratio:16/9;border-radius:0}.banner .track{padding:0}.banner.m .tile{aspect-ratio:9/16;max-height:80vh}',
    '.fl{position:fixed;bottom:16px;z-index:2147482000;width:110px}.fl.right{right:16px}.fl.left{left:16px}.fl .tile{flex:none;width:110px}.fl .info{display:none}',
    '.fx{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;font-size:11px;z-index:2}',
    '.gal{position:relative;width:100%;aspect-ratio:var(--tuco-ratio,1/1);border-radius:12px;overflow:hidden;background:#f3f3f3}.gal video{width:100%;height:100%;object-fit:cover;display:block;cursor:pointer}',
    '.snd{position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:15px;cursor:pointer}',
    '@media(max-width:749px){.title{font-size:22px}.fl,.fl .tile{width:92px}}'
  ].join('');

  var PCSS = [
    ':host{all:initial}.m{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.93);font-family:Poppins,system-ui,sans-serif}',
    '.reel{height:100%;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;overscroll-behavior:contain}.reel::-webkit-scrollbar{display:none}',
    '.slide{position:relative;height:100%;scroll-snap-align:start;scroll-snap-stop:always;display:flex;justify-content:center}',
    '.slide video{height:100%;width:100%;max-width:480px;object-fit:contain;background:#000}',
    '.ui{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;box-sizing:border-box;padding:24px 16px calc(20px + env(safe-area-inset-bottom));color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.75))}',
    '[hidden]{display:none!important}.t{margin:0 0 8px;font-weight:600;font-size:15px}.p{display:flex;align-items:center;gap:10px;background:#fff;color:#222;border-radius:12px;padding:8px}',
    '.p img{width:52px;height:52px;object-fit:cover;border-radius:8px;flex:none}.pm{flex:1;min-width:0;font-size:13px;line-height:1.3}.pm b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.atc{border:0;border-radius:30px;background:#ffd94a;color:#4d4747;font:600 13px Poppins,system-ui,sans-serif;padding:10px 16px;cursor:pointer}.atc[disabled]{opacity:.6}',
    '.b{position:absolute;z-index:3;top:calc(12px + env(safe-area-inset-top));width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer}.x{right:12px}.s{right:60px}'
  ].join('');

  var productCache = {};
  function getProduct(handle) {
    if (!handle) return Promise.resolve(null);
    if (!productCache[handle]) {
      productCache[handle] = fetch('/products/' + encodeURIComponent(handle) + '.js').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    return productCache[handle];
  }
  function money(cents) {
    var cur = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'INR';
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(cents / 100); } catch (e) { return ''; }
  }
  function track(e) {
    try { fetch(API + '/api/public/events', { method: 'POST', body: JSON.stringify(e), keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(function () {}); } catch (err) { /* ignore */ }
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // Adds to the real cart and refreshes the theme's cart drawer when it exposes renderContents.
  function addToCart(variantId) {
    var fd = new FormData();
    fd.append('id', variantId);
    fd.append('quantity', '1');
    fd.append('sections', 'cart-drawer,cart-icon-bubble');
    fd.append('sections_url', window.location.pathname);
    return fetch('/cart/add.js', { method: 'POST', body: fd, headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('add failed');
      return r.json();
    }).then(function (state) {
      var drawer = document.querySelector('cart-drawer');
      if (drawer && drawer.renderContents && state.sections) drawer.renderContents(state);
      return state;
    });
  }

  function openPlayer(videos, start) {
    var host = document.createElement('div');
    var root = host.attachShadow({ mode: 'open' });
    var muted = true;
    root.innerHTML = '<style>' + PCSS + '</style><div class="m"><button class="b x" aria-label="Close">✕</button><button class="b s" aria-label="Sound">🔇</button><div class="reel">' +
      videos.map(function (v) {
        return '<div class="slide" data-id="' + esc(v.id) + '" data-h="' + esc(v.product.handle) + '"><video src="' + esc(v.url) + '" muted loop playsinline></video><div class="ui"><p class="t">' + esc(v.title) +
          '</p><div class="p" hidden><img alt=""><div class="pm"><b></b><span></span></div><button class="atc">Add to cart</button></div></div></div>';
      }).join('') + '</div></div>';
    document.body.appendChild(host);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    var reel = root.querySelector('.reel');
    var slides = [].slice.call(reel.children);
    var watch = {};
    slides.forEach(function (sl, i) {
      getProduct(videos[i].product.handle).then(function (prod) {
        if (!prod) return;
        var v = prod.variants.filter(function (x) { return x.available; })[0];
        var box = sl.querySelector('.p');
        if (!v) return;
        box.hidden = false;
        var img = prod.featured_image;
        if (img) box.querySelector('img').src = img; else box.querySelector('img').hidden = true;
        box.querySelector('b').textContent = prod.title;
        box.querySelector('span').textContent = money(v.price);
        var btn = box.querySelector('.atc');
        btn.onclick = function () {
          btn.disabled = true;
          btn.textContent = 'Adding...';
          addToCart(v.id).then(function () { btn.textContent = 'Added ✓'; track({ type: 'atc', videoId: videos[i].id }); })
            .catch(function () { window.location.href = '/products/' + prod.handle; });
        };
      });
    });
    function flush(id) { if (watch[id]) { track({ type: 'watch', videoId: id, secs: (Date.now() - watch[id]) / 1000 }); delete watch[id]; } }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var vid = e.target.querySelector('video'), id = e.target.getAttribute('data-id');
        if (e.isIntersecting) { vid.muted = muted; vid.play().catch(function () {}); watch[id] = Date.now(); track({ type: 'play', videoId: id }); }
        else { vid.pause(); flush(id); }
      });
    }, { root: reel, threshold: 0.7 });
    slides.forEach(function (s) { io.observe(s); });
    if (slides[start]) slides[start].scrollIntoView();

    function close() {
      Object.keys(watch).forEach(flush);
      io.disconnect();
      host.remove();
      document.documentElement.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    root.querySelector('.x').onclick = close;
    root.querySelector('.s').onclick = function (e) {
      muted = !muted;
      e.currentTarget.textContent = muted ? '🔇' : '🔊';
      slides.forEach(function (s) { s.querySelector('video').muted = muted; });
    };
  }

  // Floating corner video: remembers when a shopper closes it for the session.
  function renderFloating(el, videos) {
    try { if (sessionStorage.getItem('tuco_float_closed')) { el.style.display = 'none'; return; } } catch (e) { /* ignore */ }
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var v = videos[0];
    var side = el.getAttribute('data-position') === 'left' ? 'left' : 'right';
    root.innerHTML = '<style>' + CSS + '</style><div class="fl ' + side + '"><button class="tile" aria-label="' + esc(v.title) + '"><video data-src="' + esc(v.url) + '" muted loop playsinline preload="none"' + (v.poster ? ' poster="' + esc(v.poster) + '"' : '') + '></video></button><button class="fx" aria-label="Close">\u2715</button></div>';
    var vid = root.querySelector('video');
    vid.src = vid.getAttribute('data-src') + '#t=0.1';
    vid.play().catch(function () {});
    root.querySelector('.tile').onclick = function () { openPlayer(videos, 0); };
    root.querySelector('.fx').onclick = function (e) {
      e.stopPropagation();
      try { sessionStorage.setItem('tuco_float_closed', '1'); } catch (err) { /* ignore */ }
      el.style.display = 'none';
    };
  }

  // Product gallery video: plays inline with a sound toggle. Optionally moves itself into the theme gallery.
  function renderGallery(el, videos) {
    var sel = el.getAttribute('data-insert-into');
    var target = sel && document.querySelector(sel);
    if (target) {
      var holder = /^(UL|OL)$/.test(target.tagName) ? document.createElement('li') : el;
      if (holder !== el) { holder.className = target.firstElementChild ? target.firstElementChild.className : ''; holder.appendChild(el); }
      if (el.getAttribute('data-insert-position') === 'last') target.appendChild(holder); else target.insertBefore(holder, target.firstChild);
    }
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var v = videos[0];
    root.innerHTML = '<style>' + CSS + '</style><div class="gal"><video data-src="' + esc(v.url) + '" muted loop playsinline preload="none"' + (v.poster ? ' poster="' + esc(v.poster) + '"' : '') + '></video><button class="snd" aria-label="Sound">\uD83D\uDD07</button></div>';
    var vid = root.querySelector('video'), btn = root.querySelector('.snd'), counted = false, started = 0;
    var toggle = function () { vid.muted = !vid.muted; btn.textContent = vid.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; };
    btn.onclick = toggle;
    vid.onclick = toggle;
    function flush() { if (started) { track({ type: 'watch', videoId: v.id, secs: (Date.now() - started) / 1000 }); started = 0; } }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!vid.src) vid.src = vid.getAttribute('data-src') + '#t=0.1';
          vid.play().catch(function () {});
          started = Date.now();
          if (!counted) { counted = true; track({ type: 'play', videoId: v.id }); }
        } else { vid.pause(); flush(); }
      });
    }, { rootMargin: '100px' }).observe(vid);
    window.addEventListener('pagehide', flush);
  }

  function render(el, videos) {
    var layout = el.getAttribute('data-layout') || 'carousel';
    var heading = el.getAttribute('data-heading') || '';
    if (videos.length && layout === 'floating') return renderFloating(el, videos);
    if (videos.length && layout === 'gallery') return renderGallery(el, videos);
    var list = layout === 'spotlight' || layout === 'banner' ? videos.slice(0, 1) : videos;
    if (!list.length) { el.style.display = 'none'; return; }
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var m = mobile();
    root.innerHTML = '<style>' + CSS + '</style><div class="' + layout + (m ? ' m' : '') + '">' + (heading ? '<div class="head"><h2 class="title">' + esc(heading) + '</h2></div>' : '') +
      '<div class="track">' + list.map(function (v, i) {
        var tile = '<button class="tile" data-i="' + i + '" aria-label="' + esc(v.title) + '">' +
          (v.poster ? '<img src="' + esc(v.poster) + '" alt="" loading="lazy">' : '') +
          '<video data-src="' + esc(v.url) + '" muted loop playsinline preload="none"' + (v.poster ? ' poster="' + esc(v.poster) + '"' : '') + '></video>' +
          '<span class="info">' + esc(v.product.title) + '<br><b>' + esc(v.product.price) + '</b></span></button>';
        return layout === 'stories' ? '<div class="item">' + tile + '<span class="lbl">' + esc(v.title) + '</span></div>' : tile;
      }).join('') + '</div></div>';

    // Load and play a tile only while it is near the viewport.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var vid = e.target;
        if (e.isIntersecting) {
          if (!vid.src) vid.src = vid.getAttribute('data-src') + '#t=0.1';
          vid.play().catch(function () {});
        } else vid.pause();
      });
    }, { rootMargin: '200px' });
    root.querySelectorAll('video').forEach(function (v) { io.observe(v); });
    root.querySelectorAll('.tile').forEach(function (t) {
      t.addEventListener('click', function () { openPlayer(list, Number(t.getAttribute('data-i'))); });
    });
  }

  function init(el) {
    if (el.__tuco) return;
    el.__tuco = true;
    var q = [];
    ['placement', 'audience', 'product'].forEach(function (k) {
      var v = el.getAttribute('data-' + k);
      if (v) q.push(k + '=' + encodeURIComponent(v));
    });
    fetch(API + '/api/public/videos?' + q.join('&')).then(function (r) { return r.json(); })
      .then(function (d) { render(el, d.videos || []); })
      .catch(function () { el.style.display = 'none'; });
  }

  function boot() { document.querySelectorAll('[data-tuco-video]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('shopify:section:load', boot);
})();
