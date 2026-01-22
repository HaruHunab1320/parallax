#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           Parallax PR Review Bot Demo                     ║"
echo "║                                                           ║"
echo "║   Multi-language agents with Prism orchestration          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for GEMINI_API_KEY
if [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${YELLOW}Warning: GEMINI_API_KEY not set. Agents will use fallback pattern matching.${NC}"
    echo -e "${YELLOW}For full LLM-powered analysis, set: export GEMINI_API_KEY=your-key${NC}"
    echo ""
fi

# Function to cleanup background processes
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Check if control plane is running
echo -e "${BLUE}Checking control plane...${NC}"
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${YELLOW}Control plane not running. Starting it...${NC}"
    echo -e "${YELLOW}Run this in another terminal: pnpm --filter @parallax/control-plane start${NC}"
    echo ""
    echo "Or start the full system with: ./start-local.sh"
    exit 1
fi
echo -e "${GREEN}✓ Control plane is running${NC}"

# Install demo dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${BLUE}Installing demo dependencies...${NC}"
    cd "$SCRIPT_DIR"
    pnpm install
fi

# Copy pattern to control plane patterns directory
echo -e "${BLUE}Registering code review pattern...${NC}"
mkdir -p "$REPO_ROOT/patterns"
cp "$SCRIPT_DIR/patterns/code-review.prism" "$REPO_ROOT/patterns/"
echo -e "${GREEN}✓ Pattern registered${NC}"

# Start Python agents
echo -e "${BLUE}Starting Python agents...${NC}"

echo "  Starting Security Agent (Python) on port 50100..."
AGENT_PORT=50100 python "$SCRIPT_DIR/agents/security-agent/agent.py" &
SECURITY_PID=$!

echo "  Starting Test Assessment Agent (Python) on port 50103..."
AGENT_PORT=50103 python "$SCRIPT_DIR/agents/test-agent/agent.py" &
TEST_PID=$!

# Start TypeScript agents
echo -e "${BLUE}Starting TypeScript agents...${NC}"

echo "  Starting Style Agent (TypeScript) on port 50101..."
AGENT_PORT=50101 pnpm tsx "$SCRIPT_DIR/agents/style-agent/agent.ts" &
STYLE_PID=$!

echo "  Starting Docs Agent (TypeScript) on port 50102..."
AGENT_PORT=50102 pnpm tsx "$SCRIPT_DIR/agents/docs-agent/agent.ts" &
DOCS_PID=$!

# Wait for agents to register
echo -e "${BLUE}Waiting for agents to register...${NC}"
sleep 5

# Check agent registration
echo -e "${BLUE}Checking agent registration...${NC}"
AGENTS=$(curl -s http://localhost:3000/api/agents 2>/dev/null || echo "[]")
AGENT_COUNT=$(echo "$AGENTS" | grep -o '"id"' | wc -l)

if [ "$AGENT_COUNT" -ge 4 ]; then
    echo -e "${GREEN}✓ All 4 agents registered${NC}"
else
    echo -e "${YELLOW}⚠ Only $AGENT_COUNT agent(s) registered. Some may still be starting...${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Demo is ready!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Agents running:"
echo "  • Security Agent (Python)     - localhost:50100"
echo "  • Style Agent (TypeScript)    - localhost:50101"
echo "  • Docs Agent (TypeScript)     - localhost:50102"
echo "  • Test Agent (Python)         - localhost:50103"
echo ""
echo "To run a code review:"
echo ""
echo "  # Review the sample code with issues:"
echo "  pnpm parallax run CodeReviewOrchestrator --input '{\"code\": \"$(cat examples/sample-code.ts)\"}'"
echo ""
echo "  # Or review your own code:"
echo "  pnpm parallax run CodeReviewOrchestrator --input '{\"code\": \"your code here\"}'"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all agents${NC}"
echo ""

# Wait for all background processes
wait
