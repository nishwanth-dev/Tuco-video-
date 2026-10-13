#!/usr/bin/env bash
# Builds a local test store page with one widget of every type, backed by a throwaway local API.
# Needs ffmpeg (brew install ffmpeg). Never touches live Loopy or tucokids.com.
# After it finishes, open http://localhost:8123/page.html
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."; OUT="${TMPDIR:-/tmp}/loopy-browser-test"; mkdir -p "$OUT"
pkill -f "wrangler dev" 2>/dev/null || true; pkill -f "http.server 8123" 2>/dev/null || true
cd "$ROOT/worker"; rm -rf .wrangler/state
for m in schema.sql migrations/002_features.sql migrations/003_widget_overrides.sql migrations/004_video_size.sql; do npx wrangler d1 execute tuco-video --local -c wrangler.test.toml --file=$m >/dev/null 2>&1 || true; done
(npx wrangler dev -c wrangler.test.toml --port 8799 --var ADMIN_TOKEN:testtoken SHOPIFY_WEBHOOK_SECRET:whsec_test STORE_URL:http://localhost:9 STORE_FALLBACK_URL:http://localhost:9 "ALLOWED_ORIGINS:http://localhost:8123,https://tucokids.com" > "$OUT/api.log" 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null localhost:8799/api/public/config && break; sleep 1; done
cd "$OUT"
for i in 1 2 3 4 5 6; do ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=540x960:rate=24,hue=h=$((i*50))" -f lavfi -i "sine=frequency=$((300+i*80))" -t 3 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart clip$i.mp4; done
ffmpeg -y -loglevel error -i clip1.mp4 -frames:v 1 poster1.jpg
cp "$ROOT/public/widget.js" .
python3 "$HERE/seed.py"
(python3 -m http.server 8123 >/dev/null 2>&1 &)
echo "Ready: http://localhost:8123/page.html   (stop with: pkill -f 'wrangler dev'; pkill -f 'http.server 8123')"
