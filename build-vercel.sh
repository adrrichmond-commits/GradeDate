#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 002
echo "[1/3] vite build"
bun install
bun run build
echo "[2/3] assemble"
rm -rf .vercel/output
mkdir -p .vercel/output/functions/render.func
cp -R dist/client .vercel/output/static
rm -f .vercel/output/static/index.html
mkdir -p .vercel/output/functions/render.func/node_modules
cp -R node_modules/sharp .vercel/output/functions/render.func/node_modules/sharp
cp -R node_modules/@img .vercel/output/functions/render.func/node_modules/@img 2>/dev/null || true
echo "[3/3] bundle"
bun build vercel-entry.ts --target node \
  --external @vercel/blob \
  --external sharp \
  --outfile .vercel/output/functions/render.func/index.mjs
cat > .vercel/output/functions/render.func/.vc-config.json <<'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs", "supportsResponseStreaming": true }
JSON
cat > .vercel/output/config.json <<'JSON'
{ "version": 3, "routes": [ { "handle": "filesystem" }, { "src": "/(.*)", "dest": "/render" } ] }
JSON
echo "done"
