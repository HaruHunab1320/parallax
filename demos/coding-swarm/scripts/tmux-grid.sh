#!/usr/bin/env bash
#
# Tmux Grid — Local terminal viewer for coding swarm thread output
#
# Creates a 2x2 tmux grid showing live SSE output from all 4 threads.
# Each pane connects to the control plane's thread stream endpoint.
#
# Usage:
#   ./tmux-grid.sh <execution-id> [--gateway host:port]
#
# Examples:
#   ./tmux-grid.sh abc123
#   ./tmux-grid.sh abc123 --gateway localhost:8080
#

set -euo pipefail

EXECUTION_ID="${1:-}"
GATEWAY="${PARALLAX_GATEWAY_HTTP:-http://34.58.31.212:8080}"
SESSION_NAME="swarm-grid"

# Parse optional args
shift || true
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

if [[ -z "$EXECUTION_ID" ]]; then
  echo "Usage: $0 <execution-id> [--gateway host:port]"
  echo ""
  echo "Creates a 2x2 tmux grid showing live thread output from a coding swarm execution."
  exit 1
fi

# Thread IDs (matches coding-swarm pattern roles)
THREADS=("architect" "engineer_a" "engineer_b" "engineer_c")
NAMES=("Echo (Claude)" "Vero (Claude)" "Sable (Codex)" "Silas (Gemini)")
COLORS=("colour166" "colour166" "colour28" "colour33")

# Build the SSE stream URL for a thread
stream_url() {
  local thread_id="$1"
  echo "${GATEWAY}/api/executions/${EXECUTION_ID}/threads/stream?threadIds=${thread_id}"
}

# Command to stream and display SSE events for a thread
stream_cmd() {
  local thread_id="$1"
  local name="$2"
  local url
  url=$(stream_url "$thread_id")
  # Use curl to stream SSE, pipe through sed to extract data lines
  echo "echo '=== ${name} === (${thread_id})'; echo 'Connecting to ${url}...'; curl -sN '${url}' | while IFS= read -r line; do case \"\$line\" in data:*) echo \"\${line#data: }\" ;; esac; done"
}

# Kill existing session if present
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create session with first pane (architect)
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50
tmux send-keys -t "$SESSION_NAME" "$(stream_cmd "${THREADS[0]}" "${NAMES[0]}")" Enter

# Split into 2x2 grid
# Right pane (engineer_a)
tmux split-window -h -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(stream_cmd "${THREADS[1]}" "${NAMES[1]}")" Enter

# Bottom-left (engineer_b)
tmux select-pane -t "$SESSION_NAME:0.0"
tmux split-window -v -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(stream_cmd "${THREADS[2]}" "${NAMES[2]}")" Enter

# Bottom-right (engineer_c)
tmux select-pane -t "$SESSION_NAME:0.2"
tmux split-window -v -t "$SESSION_NAME"
tmux send-keys -t "$SESSION_NAME" "$(stream_cmd "${THREADS[3]}" "${NAMES[3]}")" Enter

# Configure status bar
tmux set -t "$SESSION_NAME" status on
tmux set -t "$SESSION_NAME" status-position top
tmux set -t "$SESSION_NAME" status-left " PARALLAX CODING SWARM "
tmux set -t "$SESSION_NAME" status-left-style "fg=white,bg=colour166,bold"
tmux set -t "$SESSION_NAME" status-left-length 30
tmux set -t "$SESSION_NAME" status-right " ${EXECUTION_ID} "
tmux set -t "$SESSION_NAME" status-right-style "fg=black,bg=cyan"
tmux set -t "$SESSION_NAME" status-right-length 50
tmux set -t "$SESSION_NAME" status-style "fg=white,bg=colour235"

# Enable mouse for scrolling
tmux set -t "$SESSION_NAME" mouse on

# Select first pane
tmux select-pane -t "$SESSION_NAME:0.0"

echo "Tmux grid created: ${SESSION_NAME}"
echo "  Execution: ${EXECUTION_ID}"
echo "  Gateway:   ${GATEWAY}"
echo ""
echo "Attach with: tmux attach -t ${SESSION_NAME}"

# Auto-attach if not already in tmux
if [[ -z "${TMUX:-}" ]]; then
  tmux attach -t "$SESSION_NAME"
fi
