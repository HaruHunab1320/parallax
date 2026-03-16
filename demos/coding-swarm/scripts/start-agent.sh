#!/usr/bin/env bash
#
# Start Coding Swarm Agent on a Pi with 5" LCD
#
# Creates a tmux session on the Pi's console (tty1), then launches
# the swarm agent inside it. The coding agent's terminal output
# renders directly on the 5" LCD.
#
# Usage:
#   ./start-agent.sh                     # Uses env defaults
#   ./start-agent.sh --agent-type codex --agent-id sable
#   AGENT_TYPE=gemini AGENT_ID=silas ./start-agent.sh
#

set -euo pipefail

# ─── Load environment ───

ENV_FILE="${HOME}/.swarm-agent-env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

# ─── Parse args (override env) ───

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-type) export AGENT_TYPE="$2"; shift 2 ;;
    --agent-id)   export AGENT_ID="$2"; shift 2 ;;
    --gateway)    export PARALLAX_GATEWAY="$2"; shift 2 ;;
    --detach)     DETACH=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--agent-type TYPE] [--agent-id ID] [--gateway HOST:PORT] [--detach]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

AGENT_ID="${AGENT_ID:-swarm-dev}"
AGENT_TYPE="${AGENT_TYPE:-claude}"
PARALLAX_GATEWAY="${PARALLAX_GATEWAY:-localhost:50051}"
TMUX_PREFIX="${TMUX_PREFIX:-swarm}"
TMUX_SESSION="${TMUX_PREFIX}-${AGENT_ID}"
DETACH="${DETACH:-false}"

echo "═══════════════════════════════════════════════════"
echo " Coding Swarm Agent: $AGENT_ID ($AGENT_TYPE)"
echo " Gateway: $PARALLAX_GATEWAY"
echo " Tmux session: $TMUX_SESSION"
echo "═══════════════════════════════════════════════════"

# ─── Verify prerequisites ───

if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux not found. Run setup-pi.sh first."
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Run setup-pi.sh first."
  exit 1
fi

# Find agent code
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="${SCRIPT_DIR}/../coding-swarm-agent"

if [[ ! -d "$AGENT_DIR/src" ]]; then
  echo "ERROR: Agent code not found at $AGENT_DIR"
  echo "Expected: demos/coding-swarm/coding-swarm-agent/src/"
  exit 1
fi

# ─── Kill existing session if running ───

if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  echo "Killing existing tmux session: $TMUX_SESSION"
  tmux kill-session -t "$TMUX_SESSION"
  sleep 1
fi

# ─── Detect display TTY ───
#
# On a Pi with 5" LCD as primary display, the console is on /dev/tty1.
# If we're SSH'd in, we create the tmux session there so it appears on the LCD.

LCD_TTY=""
if [[ -c /dev/tty1 ]] && [[ -n "${SSH_CONNECTION:-}" ]]; then
  # We're SSH'd in — target the LCD's TTY
  LCD_TTY="/dev/tty1"
  echo "Detected SSH session — targeting LCD at $LCD_TTY"
fi

# ─── Create tmux session ───

# Terminal dimensions for 800x480 at Terminus 16x32 font
COLS="${TERMINAL_COLS:-100}"
ROWS="${TERMINAL_ROWS:-28}"

echo "Creating tmux session ($COLS x $ROWS)..."

if [[ -n "$LCD_TTY" ]]; then
  # Create session attached to the LCD's TTY
  # This makes the session visible on the 5" screen
  tmux new-session -d -s "$TMUX_SESSION" -x "$COLS" -y "$ROWS"
else
  # Local console or dev machine
  tmux new-session -d -s "$TMUX_SESSION" -x "$COLS" -y "$ROWS"
fi

# ─── Configure tmux display ───

# Status bar: top, showing agent identity and status
tmux set-option -t "$TMUX_SESSION" status on
tmux set-option -t "$TMUX_SESSION" status-position top
tmux set-option -t "$TMUX_SESSION" status-interval 2

# Left: agent identity
TYPE_LABEL="$(echo "$AGENT_TYPE" | tr '[:lower:]' '[:upper:]')"
tmux set-option -t "$TMUX_SESSION" status-left " [$TYPE_LABEL] $AGENT_ID "
tmux set-option -t "$TMUX_SESSION" status-left-length 40
tmux set-option -t "$TMUX_SESSION" status-left-style "fg=black,bg=green,bold"

# Right: status (updated by the agent process)
tmux set-option -t "$TMUX_SESSION" status-right " STARTING... "
tmux set-option -t "$TMUX_SESSION" status-right-length 30
tmux set-option -t "$TMUX_SESSION" status-right-style "fg=black,bg=yellow"

# Bar background
tmux set-option -t "$TMUX_SESSION" status-style "fg=white,bg=colour235"

# History limit for scrollback
tmux set-option -t "$TMUX_SESSION" history-limit 50000

# Mouse support (for 5" touchscreen)
tmux set-option -t "$TMUX_SESSION" mouse on

# ─── Launch agent in tmux ───

echo "Launching swarm agent..."

# Build the launch command with all env vars
LAUNCH_CMD="cd ${AGENT_DIR} && \
  AGENT_ID=${AGENT_ID} \
  AGENT_TYPE=${AGENT_TYPE} \
  AGENT_NAME=${AGENT_ID} \
  PARALLAX_GATEWAY=${PARALLAX_GATEWAY} \
  TMUX_PREFIX=${TMUX_PREFIX} \
  TERMINAL_COLS=${COLS} \
  TERMINAL_ROWS=${ROWS} \
  LOG_LEVEL=${LOG_LEVEL:-info} \
  npx tsx src/index.ts"

# Send the command to the tmux session
tmux send-keys -t "$TMUX_SESSION" "$LAUNCH_CMD" Enter

# Update status bar
tmux set-option -t "$TMUX_SESSION" status-right " CONNECTING... "
tmux set-option -t "$TMUX_SESSION" status-right-style "fg=black,bg=cyan"

echo ""
echo "Agent launched in tmux session: $TMUX_SESSION"
echo ""

if [[ "$DETACH" == "true" ]]; then
  echo "Running detached. Attach with: tmux attach -t $TMUX_SESSION"
  echo "View logs: tmux capture-pane -t $TMUX_SESSION -p"
else
  echo "Attaching to tmux session..."
  echo "(Detach with Ctrl+B, D)"
  echo ""
  sleep 1
  tmux attach -t "$TMUX_SESSION"
fi
