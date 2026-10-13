# Loopy testing and go-live guide

Nothing here touches the live Loopy, the live database or tucokids.com. Tests run against a throwaway local copy
(local database and local file storage), and the store address is pointed at a dead local port.

## Run the automated tests

```bash
tests/run.sh
```

Starts a fresh local API, runs all checks (252), stops it. Covers: admin login and token checks, every video and widget
rule (bad links, long text, negative sizes, injection text, appearance overrides), "Pick videos" with nothing picked,
scheduled and archived videos, store-only origins (including look-alike domains), event validation and limits,
analytics counts, the Shopify order webhook (signature, tampering, re-sent orders, store totals), uploads, range
requests for video, backup export and the system check.

## Customization checks (needs Chrome, included in `tests/run.sh`)

`tests/customization.test.mjs` drives a real headless Chrome and measures what is drawn. It changes every look-and-feel
setting, in all three places (global Customizations, each widget's Appearance, and the theme block / section options),
for desktop and mobile separately, and checks sizes, shapes, corners, gaps, margins, heights, colours, fonts, text,
ordering and switches. It also checks that values for one device never leak to the other (the switch is at 750 px),
that a widget override beats the global setting and a theme block option beats both, and that junk or extreme
values (negative, huge, `4/0`, script text) never break the page. 221 checks, including per-widget colours, fonts and text and fully separate desktop and mobile banner mode, fit and focus.

## Browser checks (needs ffmpeg)

```bash
tests/browser/setup.sh
```

Builds a fake store page at http://localhost:8123/page.html with one widget of every type and a theme that hides empty
boxes (the trap that once hid the widget). Also: `broken.html` (dead video link, very long text), `dead.html` (API
down), `double.html` (script and widget twice), `bare.html` (widget id typed as plain text), `late.html` (widget added
after the page loads). Open them in a normal visible browser tab: videos only play in a visible tab.
Stop with `pkill -f "wrangler dev"; pkill -f "http.server 8123"`.

## Verified so far

- API: 20 automated checks pass. Volume: 300 videos, 90 widgets, 50,000 events: slowest call 86 ms.
- Admin: all 10 pages load with that data, no errors.
- Widgets in real Chrome: carousel, stories, banner, spotlight, floating and gallery render and play; player opens,
  Escape and the back button close it; empty, switched-off and wrong-id widgets stay invisible; API down hides the widget
  and the page keeps working; dead video links remove their tile; long text is clamped; no layout shift.
- YouTube: overlay hidden until playing.
- In-browser "Make smaller": 38 MB to 3.2 MB test clip, plays back at 1280x720.
- Security: admin token compared in constant time; only the listed store origins can send events; errors never show
  internal details.

## Not verified yet (do these before cancelling Whatmore)

- Real R2 storage (needs the R2 subscription) and the Whatmore migration with your real videos.
- Instagram sync with a real token.
- The Shopify order webhook with real orders, and migration 005 on the live database.
- Safari and iPhone.
- Admin sign-in security beyond the token (deliberately deferred).
- Real cart drawer add-to-cart on the live theme.

## Database migrations (live database)

Already applied: schema, 002, 003, 004. Still to apply: 005 (store totals on Home).

```bash
cd worker && npx wrangler d1 execute tuco-video --remote --file=migrations/005_store_orders.sql
```

Take a backup first: Loopy admin, Integrations, Download backup.

## Roll back a bad deploy

```bash
cd worker && npx wrangler rollback        # API
cd admin-host && npx wrangler rollback    # admin and widget.js
```
