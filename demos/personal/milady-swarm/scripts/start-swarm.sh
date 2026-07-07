#!/usr/bin/env bash
#
# Start Milady Swarm — launches 4 Milady instances and 4 bridge agents
#
# Usage:
#   ./start-swarm.sh [--gateway host:port] [--dry-run]
#
# Expects:
#   - Milady binary available as `milady` on PATH (or MILADY_BIN env var)
#   - Character configs in ../characters/
#   - Bridge agent source in ../milady-bridge-agent/
#
# Environment:
#   MILADY_BIN          — path to milady binary (default: milady)
#   MILADY_TOKEN        — shared API token for all instances
#   PARALLAX_GATEWAY    — gateway endpoint (default: 34.58.31.212:8081)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHARACTERS_DIR="$PROJECT_DIR/characters"
AGENT_DIR="$PROJECT_DIR/milady-bridge-agent"
PID_FILE="$PROJECT_DIR/.swarm-pids"
STATE_DIR="$PROJECT_DIR/.milady-state"

MILADY_BIN="${MILADY_BIN:-milady}"
MILADY_TOKEN="${MILADY_TOKEN:-}"
GATEWAY="${PARALLAX_GATEWAY:-34.58.31.212:8081}"

if [[ -z "$MILADY_TOKEN" ]]; then
  echo "Error: MILADY_TOKEN is required"
  exit 1
fi

# Parse args
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

# Agent definitions: name role port
AGENTS=(
  "mila:strategist:2138"
  "nova:poster:2139"
  "suki:engager:2140"
  "kira:amplifier:2141"
)

# Clean up old PIDs
if [[ -f "$PID_FILE" ]]; then
  echo "Cleaning up old swarm processes..."
  "$SCRIPT_DIR/stop-swarm.sh" 2>/dev/null || true
fi

mkdir -p "$STATE_DIR"
> "$PID_FILE"

echo "=== Starting Milady Swarm ==="
echo "Gateway: $GATEWAY"
echo ""

# Phase 1: Start Milady instances
echo "--- Phase 1: Starting Milady instances ---"
for entry in "${AGENTS[@]}"; do
  IFS=':' read -r name role port <<< "$entry"
  config_file="$CHARACTERS_DIR/${role}.json"
  state_dir="$STATE_DIR/$name"

  mkdir -p "$state_dir"

  echo "Starting Milady instance: $name ($role) on port $port"

  MILADY_CONFIG_PATH="$config_file" \
  MILADY_STATE_DIR="$state_dir" \
  MILADY_PORT="$port" \
    "$MILADY_BIN" &

  echo "$!" >> "$PID_FILE"
done

# Wait for health checks
echo ""
echo "Waiting for Milady instances to become healthy..."
for entry in "${AGENTS[@]}"; do
  IFS=':' read -r name role port <<< "$entry"
  url="http://localhost:$port/api/health"

  for i in $(seq 1 30); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      echo "  $name ($role) — healthy"
      break
    fi
    if [[ $i -eq 30 ]]; then
      echo "  $name ($role) — TIMEOUT (continuing anyway)"
    fi
    sleep 1
  done
done

# Phase 2: Start bridge agents
echo ""
echo "--- Phase 2: Starting bridge agents ---"
for entry in "${AGENTS[@]}"; do
  IFS=':' read -r name role port <<< "$entry"

  echo "Starting bridge agent: $name ($role) → localhost:$port"

  AGENT_ID="$name" \
  AGENT_NAME="$name" \
  AGENT_ROLE="$role" \
  MILADY_URL="http://localhost:$port" \
  MILADY_TOKEN="$MILADY_TOKEN" \
  PARALLAX_GATEWAY="$GATEWAY" \
    npx tsx "$AGENT_DIR/src/index.ts" &

  echo "$!" >> "$PID_FILE"
done

echo ""
echo "=== Milady Swarm running ==="
echo "PIDs saved to $PID_FILE"
echo "Stop with: $SCRIPT_DIR/stop-swarm.sh"
