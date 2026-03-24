#!/usr/bin/env bash
#
# Watch Echo — starts the architect agent and auto-attaches to spawned CLI sessions
#
# Usage: ./watch-echo.sh [--gateway host:port]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../coding-swarm-agent" && pwd)"

AGENT_ID="${AGENT_ID:-echo}"
AGENT_TYPE="${AGENT_TYPE:-claude}"
AGENT_NAME="${AGENT_NAME:-Echo}"
GATEWAY="${PARALLAX_GATEWAY:-34.58.31.212:8081}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway) GATEWAY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "Starting Echo (architect) agent..."
echo "  Agent: $AGENT_ID ($AGENT_TYPE)"
echo "  Gateway: $GATEWAY"
echo ""

# Start agent in background tmux session
tmux kill-session -t swarm-agent 2>/dev/null || true
tmux new-session -d -s swarm-agent \
  "cd $AGENT_DIR && AGENT_ID=$AGENT_ID AGENT_TYPE=$AGENT_TYPE AGENT_NAME=$AGENT_NAME AGENT_DEVICE=mac PARALLAX_GATEWAY=$GATEWAY node dist/index.js"

echo "Agent running in tmux session 'swarm-agent'"
echo "Watching for coding CLI sessions..."
echo ""

# Watch for spawned CLI sessions and auto-attach
while true; do
  CLI_SESSION=$(tmux ls -F '#{session_name}' 2>/dev/null | grep 'swarm-tmux' | tail -1 || true)
  if [ -n "$CLI_SESSION" ]; then
    echo "Attaching to $CLI_SESSION"
    tmux attach -t "$CLI_SESSION"
    echo ""
    echo "Session ended. Watching for next coding session..."
  fi
  sleep 2
done
