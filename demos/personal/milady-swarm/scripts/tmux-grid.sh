#!/usr/bin/env bash
#
# Tmux Grid — 2x2 display showing bridge agent logs for the Milady Swarm
#
# Usage:
#   ./tmux-grid.sh [--gateway host:port]
#
# Each pane tails the bridge agent log for one character.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$PROJECT_DIR/milady-bridge-agent"

GATEWAY="${PARALLAX_GATEWAY:-34.58.31.212:8081}"
MILADY_TOKEN="${MILADY_TOKEN:-}"
SESSION_NAME="milady-swarm"

# Parse optional args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway)
      GATEWAY="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$MILADY_TOKEN" ]]; then
  echo "Error: MILADY_TOKEN is required"
  exit 1
fi

# Agent definitions: name role port color
AGENTS=(
  "mila:strategist:2138:colour213"
  "nova:poster:2139:colour39"
  "suki:engager:2140:colour120"
  "kira:amplifier:2141:colour208"
)

# Build the run command for each agent
agent_cmd() {
  local name="$1" role="$2" port="$3"
  echo "AGENT_ID=$name AGENT_NAME=$name AGENT_ROLE=$role MILADY_URL=http://localhost:$port MILADY_TOKEN=$MILADY_TOKEN PARALLAX_GATEWAY=$GATEWAY npx tsx $AGENT_DIR/src/index.ts"
}

# Kill existing session if present
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create session with first pane (MILA — strategist)
IFS=':' read -r name role port color <<< "${AGENTS[0]}"
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50
tmux send-keys -t "$SESSION_NAME" "$(agent_cmd "$name" "$role" "$port")" Enter

# Right pane (NOVA — poster)
IFS=':' read -r name role port color <<< "${AGENTS[1]}"
tmux split-window -h -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(agent_cmd "$name" "$role" "$port")" Enter

# Bottom-left (SUKI — engager)
tmux select-pane -t "$SESSION_NAME:0.0"
IFS=':' read -r name role port color <<< "${AGENTS[2]}"
tmux split-window -v -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(agent_cmd "$name" "$role" "$port")" Enter

# Bottom-right (KIRA — amplifier)
tmux select-pane -t "$SESSION_NAME:0.2"
IFS=':' read -r name role port color <<< "${AGENTS[3]}"
tmux split-window -v -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(agent_cmd "$name" "$role" "$port")" Enter

# Configure status bar
tmux set -t "$SESSION_NAME" status on
tmux set -t "$SESSION_NAME" status-position top
tmux set -t "$SESSION_NAME" status-left " MILADY SWARM "
tmux set -t "$SESSION_NAME" status-left-style "fg=white,bg=colour213,bold"
tmux set -t "$SESSION_NAME" status-left-length 20
tmux set -t "$SESSION_NAME" status-right " MILA | NOVA | SUKI | KIRA "
tmux set -t "$SESSION_NAME" status-right-style "fg=black,bg=cyan"
tmux set -t "$SESSION_NAME" status-right-length 40
tmux set -t "$SESSION_NAME" status-style "fg=white,bg=colour235"

# Enable mouse for scrolling
tmux set -t "$SESSION_NAME" mouse on

# Select first pane
tmux select-pane -t "$SESSION_NAME:0.0"

echo "Tmux grid created: ${SESSION_NAME}"
echo "  MILA (strategist) | NOVA (poster)"
echo "  SUKI (engager)    | KIRA (amplifier)"
echo ""
echo "Attach with: tmux attach -t ${SESSION_NAME}"

# Auto-attach if not already in tmux
if [[ -z "${TMUX:-}" ]]; then
  tmux attach -t "$SESSION_NAME"
fi
