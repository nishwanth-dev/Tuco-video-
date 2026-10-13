#!/usr/bin/env bash
# Starts a throwaway local API and runs all tests (API, importer, Instagram and, if Chrome is installed, the browser customization checks).
# Never touches the live Loopy, the live database, or tucokids.com.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'pkill -f "wrangler dev" 2>/dev/null || true' EXIT
# A tiny pretend store (started by the admin test) lets the Products page load products without touching the real store.
export LOOPY_TEST_STORE=http://localhost:8093
tests/start-api.sh
node --test --test-concurrency=1 tests/*.test.mjs
