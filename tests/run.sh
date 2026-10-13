#!/usr/bin/env bash
# Starts a throwaway local API (test config, local database and storage) and runs the API tests.
# Never touches the live Loopy, the live database, or tucokids.com.
set -euo pipefail
cd "$(dirname "$0")/../worker"
PORT=8799
pkill -f "wrangler dev" 2>/dev/null || true
rm -rf .wrangler/state
for m in schema.sql; do npx wrangler d1 execute tuco-video --local -c wrangler.test.toml --file=$m >/dev/null; done
for m in migrations/002_features.sql migrations/003_widget_overrides.sql migrations/004_video_size.sql; do npx wrangler d1 execute tuco-video --local -c wrangler.test.toml --file=$m >/dev/null 2>&1 || true; done
npx wrangler dev -c wrangler.test.toml --port $PORT --var ADMIN_TOKEN:testtoken SHOPIFY_WEBHOOK_SECRET:whsec_test STORE_URL:http://localhost:9 STORE_FALLBACK_URL:http://localhost:9 IG_TOKEN:igtest IG_USER_ID:123 IG_GRAPH_URL:http://localhost:8090 "ALLOWED_ORIGINS:https://tucokids.com,https://www.tucokids.com" > /tmp/loopy-test-api.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; pkill -f "wrangler dev" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null localhost:$PORT/api/public/config && break; sleep 1; done
cd ..
node --test --test-concurrency=1 tests/*.test.mjs
