#!/bin/bash
# Starts EcoTrace on this Mac only (no public link). Stop with Ctrl+C.
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

echo
echo "EcoTrace is running at: http://localhost:5050"
echo "Demo login: owner@ecotrace.demo / demo1234"
echo "Press Ctrl+C to stop."
open http://localhost:5050
trap 'kill $API $ML 2>/dev/null; exit' INT TERM
wait
