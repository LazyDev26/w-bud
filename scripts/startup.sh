#!/bin/bash

# w-bud startup script — starts both backend and frontend
# Usage: ./scripts/startup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cleanup() {
  echo ""
  echo "[w-bud] Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "[w-bud] Stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "[w-bud] Starting backend on :8000..."
cd "$ROOT_DIR/backend" && go run main.go &
BACKEND_PID=$!

# Start frontend
echo "[w-bud] Starting frontend on :3000..."
cd "$ROOT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

echo "[w-bud] Backend PID=$BACKEND_PID | Frontend PID=$FRONTEND_PID"
echo "[w-bud] Press Ctrl+C to stop both."

wait