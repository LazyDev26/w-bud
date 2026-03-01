#!/bin/bash

# w-bud setup — creates the data directory structure
# The backend will populate default config files on first startup.
# Usage: ./scripts/setup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"

if [ -d "$DATA_DIR" ]; then
  echo "[w-bud] data/ directory already exists — skipping."
  exit 0
fi

echo "[w-bud] Creating data directory..."
mkdir -p "$DATA_DIR/logs"

echo "[w-bud] Initializing data files..."

cat > "$DATA_DIR/config.json" << 'EOF'
{
  "jira": {
    "base_url": "",
    "email": "",
    "api_token": "",
    "board_id": "",
    "sprint_id": ""
  },
  "webex": {
    "token": "",
    "room_id": ""
  },
  "agents": {
    "planning_agent": "cursor",
    "execution_agent": "codex",
    "auto_approve_plan": false
  },
  "global_prompts": [],
  "workspaces_root": ""
}
EOF

cat > "$DATA_DIR/repos.json" << 'EOF'
{
  "repos": []
}
EOF

cat > "$DATA_DIR/stories.json" << 'EOF'
{
  "sprint_id": "",
  "sprint_name": "",
  "last_fetched": "",
  "stories": []
}
EOF

cat > "$DATA_DIR/runs.json" << 'EOF'
{
  "runs": []
}
EOF

cat > "$DATA_DIR/locks.json" << 'EOF'
{}
EOF

echo "[w-bud] Setup complete."
echo "        Data directory: $DATA_DIR"
echo "        Configure your settings at http://localhost:3000/settings"
