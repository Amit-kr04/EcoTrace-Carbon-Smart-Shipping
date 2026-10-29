#!/bin/bash
# Starts EcoTrace (ML service + API serving the built website) and opens a public
# Cloudflare Tunnel link for teammates. Stop everything with Ctrl+C.
set -e
cd "$(dirname "$0")"
mkdir -p logs

echo "Building the website..."
(cd client && npm run build >/dev/null)

echo "Starting the ML service (port 8000)..."
(cd ml && .venv/bin/uvicorn app.main:app --port 8000 > ../logs/ml.log 2>&1) &
ML=$!

echo "Starting the API + website (port 5050)..."
(cd server && node src/index.js > ../logs/server.log 2>&1) &
API=$!
until curl -s -o /dev/null http://localhost:5050/api/health; do sleep 1; done

echo "Opening the public tunnel..."
cloudflared tunnel --no-autoupdate --url http://localhost:5050 > logs/tunnel.log 2>&1 &
TUN=$!
caffeinate -i -w $TUN &   # keep the Mac awake while the tunnel runs
until URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" logs/tunnel.log | head -1) && [ -n "$URL" ]; do sleep 1; done

echo
echo "EcoTrace is live at: $URL"
echo "Demo login: owner@ecotrace.demo / demo1234"
echo "Press Ctrl+C to stop."
trap 'kill $TUN $API $ML 2>/dev/null; exit' INT TERM
wait
