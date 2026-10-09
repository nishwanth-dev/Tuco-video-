# Loopy

Shoppable video platform for Tuco Kids (replaces Whatmore). Minimal white and grey admin, Cloudflare backend, drop-in store widget.

## Parts
- **Admin site** (React + Vite, `src/`): same structure as Whatmore. Home checklist, Videos (filters, tagging, Instagram sync), Products (Arrange Media), widget pages (Product, Homepage, Collection, Pages), Customizations with live preview, Analytics, Integrations.
- **API** (Cloudflare Worker + D1 + R2, `worker/`): videos, several products per video, widgets, settings, events, analytics, R2 upload and streaming, store product search, weekly Instagram copy.
- **Store widget** (`public/widget.js`): carousel, stories, banner, spotlight, floating and gallery layouts, fullscreen player with add to cart, like and share. Settings come from Customizations. Shadow DOM keeps theme CSS from breaking it.

## Run locally
```
cd worker && npm install && npm run db:local
npx wrangler dev --local --port 8799 --var ADMIN_TOKEN:testtoken
cd .. && npm install && echo "VITE_API_URL=http://localhost:8799" > .env.local && npm run dev
```
Sign in with the admin token. Demo page: `/widget-demo.html` (update its widget ids from the admin).

## Deploy (Cloudflare free plan)
1. `cd worker && npx wrangler d1 create tuco-video`, paste the id into `wrangler.toml`, then `npm run db:remote`.
2. `npx wrangler r2 bucket create tuco-videos` (R2 needs billing activated; free tier is 10 GB).
3. `npx wrangler secret put ADMIN_TOKEN` (and `IG_TOKEN` for Instagram sync).
4. `npx wrangler deploy`, set `VITE_API_URL` to the Worker URL, `npm run build`, publish `dist/` on Cloudflare Pages.

## Live (Cloudflare free plan)
- API: https://tuco-video-api.tucokids.workers.dev (`worker/`, `npx wrangler deploy`)
- Admin: https://loopy.tucokids.workers.dev (`admin-host/`: `VITE_API_URL=<api url> npm run build`, then `cd admin-host && ../worker/node_modules/.bin/wrangler deploy`)
- R2 video storage is off until R2 is enabled; then uncomment the `r2_buckets` block in `worker/wrangler.toml` and redeploy.

## Add to the store
In the admin, open a widget page, click **Get embed code**, and paste it into a Custom Liquid section (add the script tag once per page).

## Limits
Uploads are capped at 100 MB on the free plan. Sales attribution needs Shopify order data and is not connected; add to cart is tracked and cart lines carry a `_tuco_video` property.
