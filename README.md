# Tuco Video Platform

Own video platform for Tuco Kids (replaces Whatmore). Three parts:

- **Admin site** (React + Vite, `src/`): upload videos, link products, pick placements, view analytics.
- **API** (Cloudflare Worker + D1 + R2, `worker/`): stores videos and events, streams files, copies Instagram reels weekly.
- **Look and feel:** admin dashboard is minimal white and grey (Inter, near-black buttons, soft borders); store widgets keep a small Tuco yellow accent (#ffd94a).
- **Store widget** (`public/widget.js`): drop-in script for tucokids.com. Carousel, stories, spotlight and banner, fullscreen player, add to cart. Uses Shadow DOM so theme CSS cannot break it.

## Run locally
```
cd worker && npm install && npm run db:local
npx wrangler dev --local --var ADMIN_TOKEN:testtoken      # API on :8799
cd .. && npm install && echo "VITE_API_URL=http://localhost:8799" > .env.local && npm run dev
```
Leave `VITE_API_URL` empty to use the browser-only demo. Sign in with the admin token. Demo page: `/widget-demo.html`.

## Deploy (Cloudflare free plan)
1. `cd worker && npx wrangler d1 create tuco-video` and paste the id into `wrangler.toml`; then `npm run db:remote`.
2. `npx wrangler r2 bucket create tuco-videos` (R2 needs a payment card on file; the free tier is 10 GB).
3. `npx wrangler secret put ADMIN_TOKEN` (and `IG_TOKEN` for Instagram sync).
4. `npx wrangler deploy`, then set `VITE_API_URL` to the Worker URL, `npm run build`, and publish `dist/` on Cloudflare Pages.

## Add to the store
```
<div data-tuco-video data-layout="carousel" data-placement="home" data-heading="Watch &amp; shop"></div>
<script src="https://YOUR-PAGES-SITE/widget.js" data-api="https://YOUR-WORKER" defer></script>
```
`data-layout`: carousel, stories, spotlight, banner, floating (corner video; `data-position="left|right"`) and gallery (product page; optional `data-insert-into=".product__media-list"` and `data-insert-position="first|last"` to add it as a gallery slide). Filters: `data-placement`, `data-audience`, `data-product` (product handle).

## Limits
Uploads through the Worker are capped at 100 MB (free plan). Instagram sync needs a Meta app and long-lived token (`IG_TOKEN`).
