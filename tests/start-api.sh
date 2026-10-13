#!/usr/bin/env bash
# Starts a throwaway local API (test config, fresh local database and storage) on http://localhost:8799 and leaves it running.
# Never touches the live Loopy, the live database, or tucokids.com. Stop it with:  pkill -f "wrangler dev"
set -euo pipefail
cd "$(dirname "$0")/../worker"
PORT=8799
pkill -f "wrangler dev" 2>/dev/null || true
rm -rf .wrangler/state
npx wrangler d1 execute tuco-video --local -c wrangler.test.toml --file=schema.sql >/dev/null
for m in migrations/002_features.sql migrations/003_widget_overrides.sql migrations/004_video_size.sql; do npx wrangler d1 execute tuco-video --local -c wrangler.test.toml --file=$m >/dev/null 2>&1 || true; done
nohup npx wrangler dev -c wrangler.test.toml --port $PORT --var ADMIN_TOKEN:testtoken SHOPIFY_WEBHOOK_SECRET:whsec_test STORE_URL:${LOOPY_TEST_STORE:-http://localhost:9} STORE_FALLBACK_URL:${LOOPY_TEST_STORE:-http://localhost:9} IG_TOKEN:igtest IG_USER_ID:123 IG_GRAPH_URL:http://localhost:8090 "ALLOWED_ORIGINS:https://tucokids.com,https://www.tucokids.com,http://localhost:8124" > /tmp/loopy-test-api.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null localhost:$PORT/api/public/config && exit 0; sleep 1; done
echo "API did not start, see /tmp/loopy-test-api.log"; exit 1
