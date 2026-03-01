#!/bin/bash

# w-bud hard reset — clears ALL data including config & repos
# Usage: ./scripts/hard-reset.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/data"

echo "[w-bud] Hard reset — clearing ALL data..."

echo '{"sprint_id":"","sprint_name":"","last_fetched":"","stories":[]}' > "$DATA_DIR/stories.json"
echo '{"runs":[]}' > "$DATA_DIR/runs.json"
echo '{}' > "$DATA_DIR/locks.json"
echo '{"repos":[]}' > "$DATA_DIR/repos.json"
echo '{"jira":{"base_url":"","email":"","api_token":"","board_id":"","sprint_id":""},"webex":{"token":"","room_id":""},"agents":{"planning_agent":"cursor","execution_agent":"codex","auto_approve_plan":false},"global_prompts":[],"workspaces_root":""}' > "$DATA_DIR/config.json"

LOGS_DIR="$DATA_DIR/logs"
if [ -d "$LOGS_DIR" ]; then
  rm -f "$LOGS_DIR"/*.log "$LOGS_DIR"/*-prompt.md
  echo "[w-bud] Cleared log files in $LOGS_DIR"
fi

echo "[w-bud] Hard reset complete. All data cleared."
