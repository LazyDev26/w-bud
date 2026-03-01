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

# Clean up worktree directories (run-* folders under workspaces_root)
WORKSPACES_ROOT=$(grep -o '"workspaces_root":[[:space:]]*"[^"]*"' "$DATA_DIR/config.json" | sed 's/.*"workspaces_root":[[:space:]]*"\(.*\)"/\1/')
if [ -n "$WORKSPACES_ROOT" ] && [ -d "$WORKSPACES_ROOT" ]; then
  for d in "$WORKSPACES_ROOT"/run-*; do
    [ -d "$d" ] && rm -rf "$d" && echo "[w-bud] Removed worktree: $d"
  done
fi

echo "[w-bud] Soft reset complete. Config and repos preserved."
