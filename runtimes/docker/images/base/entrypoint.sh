#!/bin/bash
#
# Parallax Agent Entrypoint
#
# Wrapper script that:
# 1. Optionally registers with Parallax control plane
# 2. Runs the CLI agent
# 3. Monitors for input from /tmp/agent-input
# 4. Handles graceful shutdown

set -e

# Log function
log() {
    echo "[$(date -Iseconds)] $1"
}

# Register with Parallax if endpoint is provided
register_agent() {
    if [ -n "$PARALLAX_REGISTRY_ENDPOINT" ]; then
        log "Registering with Parallax at $PARALLAX_REGISTRY_ENDPOINT"

        curl -s -X POST "$PARALLAX_REGISTRY_ENDPOINT/api/agents" \
            -H "Content-Type: application/json" \
            -d "{
                \"id\": \"$AGENT_ID\",
                \"name\": \"$AGENT_NAME\",
                \"type\": \"$AGENT_TYPE\",
                \"role\": \"$AGENT_ROLE\",
                \"capabilities\": $AGENT_CAPABILITIES,
                \"endpoint\": \"http://$(hostname):8080\"
            }" || log "Registration failed (non-fatal)"
    fi
}

# Deregister on shutdown
deregister_agent() {
    if [ -n "$PARALLAX_REGISTRY_ENDPOINT" ] && [ -n "$AGENT_ID" ]; then
        log "Deregistering from Parallax"
        curl -s -X DELETE "$PARALLAX_REGISTRY_ENDPOINT/api/agents/$AGENT_ID" || true
    fi
}

# Handle shutdown signals
shutdown() {
    log "Received shutdown signal"
    deregister_agent
    exit 0
}

trap shutdown SIGTERM SIGINT

# Create input pipe
mkfifo /tmp/agent-input 2>/dev/null || true

# Register agent
register_agent

log "Agent ready: $AGENT_NAME ($AGENT_TYPE)"
echo "[READY]"

# Run the main command if provided, otherwise wait for input
if [ $# -gt 0 ]; then
    exec "$@"
else
    # Default: keep running and process input
    while true; do
        if [ -p /tmp/agent-input ]; then
            if read -r line < /tmp/agent-input 2>/dev/null; then
                log "Received input: $line"
                echo "$line"
            fi
        fi
        sleep 0.1
    done
fi
