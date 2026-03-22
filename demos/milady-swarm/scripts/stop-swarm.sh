#!/usr/bin/env bash
#
# Stop Milady Swarm — gracefully shuts down all Milady + bridge agent processes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_DIR/.swarm-pids"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found at $PID_FILE — nothing to stop"
  exit 0
fi

echo "Stopping Milady Swarm..."

while IFS= read -r pid; do
  if [[ -z "$pid" ]]; then continue; fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "  Sending SIGTERM to PID $pid"
    kill "$pid" 2>/dev/null || true
  else
    echo "  PID $pid already stopped"
  fi
done < "$PID_FILE"

# Wait for processes to exit
sleep 2

# Force-kill any remaining
while IFS= read -r pid; do
  if [[ -z "$pid" ]]; then continue; fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "  Force-killing PID $pid"
    kill -9 "$pid" 2>/dev/null || true
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "Milady Swarm stopped."
