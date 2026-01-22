#!/bin/bash
# Multi-Model Voting Demo Runner
# Starts all voting agents in the background

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🗳️  Multi-Model Voting Demo"
echo "════════════════════════════════════════"
echo ""

# Check for GEMINI_API_KEY
if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  Warning: GEMINI_API_KEY not set"
    echo "   Set it with: export GEMINI_API_KEY=your-key"
    echo ""
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

echo "🚀 Starting voting agents..."
echo ""

# Start agents in background
echo "   Starting Gemini 2.0 Flash agent on port 50200..."
AGENT_PORT=50200 pnpm agent:flash2 &
FLASH2_PID=$!

echo "   Starting Gemini 1.5 Pro agent on port 50201..."
AGENT_PORT=50201 pnpm agent:pro &
PRO_PID=$!

echo "   Starting Gemini 1.5 Flash agent on port 50202..."
AGENT_PORT=50202 pnpm agent:flash &
FLASH_PID=$!

echo ""
echo "✅ All agents started!"
echo ""
echo "   Flash 2 Agent PID: $FLASH2_PID"
echo "   Pro Agent PID:     $PRO_PID"
echo "   Flash Agent PID:   $FLASH_PID"
echo ""
echo "📝 To run a vote:"
echo "   pnpm vote \"Is this a good idea?\""
echo "   pnpm vote examples/content-moderation.json"
echo ""
echo "🛑 To stop agents:"
echo "   kill $FLASH2_PID $PRO_PID $FLASH_PID"
echo ""
echo "Press Ctrl+C to stop all agents..."

# Wait for Ctrl+C
trap "echo ''; echo 'Stopping agents...'; kill $FLASH2_PID $PRO_PID $FLASH_PID 2>/dev/null; exit 0" INT
wait
