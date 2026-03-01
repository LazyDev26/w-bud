#!/bin/bash

# w-bud soft reset — clears stories, runs, and locks but keeps config & repos
# Usage: ./scripts/soft-reset.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/data"

echo "[w-bud] Soft reset — clearing stories, runs, and locks..."

echo '{"sprint_id":"","sprint_name":"","last_fetched":"","stories":[]}' > "$DATA_DIR/stories.json"
echo '{"runs":[]}' > "$DATA_DIR/runs.json"
echo '{}' > "$DATA_DIR/locks.json"

LOGS_DIR="$DATA_DIR/logs"
if [ -d "$LOGS_DIR" ]; then
  rm -f "$LOGS_DIR"/*.log "$LOGS_DIR"/*-prompt.md
  echo "[w-bud] Cleared log files in $LOGS_DIR"
fi

echo "[w-bud] Soft reset complete. Config and repos preserved."
