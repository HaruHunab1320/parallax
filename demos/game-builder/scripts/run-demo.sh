#!/bin/bash
#
# Parallax Game Builder Demo - Full Stack Runner
#
# This script brings up the complete Parallax stack and runs the game builder demo.
#
# Prerequisites:
#   - Docker and docker compose
#   - Node.js 18+
#   - pnpm
#   - GitHub PAT with repo access
#
# Usage:
#   ./scripts/run-demo.sh --repo owner/repo --token ghp_xxx
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
REPO=""
TOKEN=""
GAME="pong"
SKIP_INFRA=false
WATCH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--repo)
            REPO="$2"
            shift 2
            ;;
        -t|--token)
            TOKEN="$2"
            shift 2
            ;;
        -g|--game)
            GAME="$2"
            shift 2
            ;;
        --skip-infra)
            SKIP_INFRA=true
            shift
            ;;
        -w|--watch)
            WATCH=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 --repo <owner/repo> --token <github_pat> [options]"
            echo ""
            echo "Options:"
            echo "  -r, --repo <owner/repo>   GitHub repo to build the game in (required)"
            echo "  -t, --token <pat>         GitHub PAT with repo access (required)"
            echo "  -g, --game <type>         Game type (default: pong)"
            echo "  --skip-infra              Skip starting infrastructure (if already running)"
            echo "  -w, --watch               Stream execution events"
            echo "  -h, --help                Show this help"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$REPO" ]]; then
    log_error "Missing required argument: --repo"
    log_info "Example: $0 --repo myorg/my-game --token ghp_xxx"
    exit 1
fi

if [[ -z "$TOKEN" ]]; then
    log_error "Missing required argument: --token"
    log_info "Create a PAT at: https://github.com/settings/tokens"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              PARALLAX GAME BUILDER - FULL STACK               ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  This demo will:                                              ║"
echo "║  1. Start infrastructure (postgres, etcd, redis, jaeger)      ║"
echo "║  2. Start the control plane                                   ║"
echo "║  3. Start the web dashboard                                   ║"
echo "║  4. Execute the game-builder pattern                          ║"
echo "║  5. Spawn AI agents to build your game                        ║"
echo "║  6. Create a PR with the complete game                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Start infrastructure
if [[ "$SKIP_INFRA" == "false" ]]; then
    log_info "Starting infrastructure..."
    cd "$REPO_ROOT"

    docker compose --profile monitoring up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 5

    # Check etcd
    if docker exec parallax-etcd etcdctl endpoint health &>/dev/null; then
        log_success "etcd is healthy"
    else
        log_warn "etcd health check failed, continuing..."
    fi

    # Check postgres
    if docker exec parallax-postgres pg_isready -U parallax &>/dev/null; then
        log_success "PostgreSQL is healthy"
    else
        log_warn "PostgreSQL health check failed, continuing..."
    fi

    # Check redis
    if docker exec parallax-redis redis-cli ping &>/dev/null; then
        log_success "Redis is healthy"
    else
        log_warn "Redis health check failed, continuing..."
    fi

    log_success "Infrastructure started"
else
    log_info "Skipping infrastructure startup (--skip-infra)"
fi

# Step 2: Start control plane (in background)
log_info "Starting control plane..."
cd "$REPO_ROOT/packages/control-plane"

# Create .env if it doesn't exist
if [[ ! -f .env ]]; then
    log_info "Creating .env from .env.example..."
    cp .env.example .env

    # Update DATABASE_URL for docker
    sed -i '' 's|localhost:5432|localhost:5435|g' .env 2>/dev/null || \
    sed -i 's|localhost:5432|localhost:5435|g' .env

    # Update etcd endpoint for docker
    sed -i '' 's|localhost:2379|localhost:2389|g' .env 2>/dev/null || \
    sed -i 's|localhost:2379|localhost:2389|g' .env
fi

# Run prisma migrations
log_info "Running database migrations..."
pnpm prisma migrate deploy 2>/dev/null || pnpm prisma db push

# Start control plane in background
log_info "Starting control plane server..."
pnpm dev &
CONTROL_PLANE_PID=$!

# Wait for control plane to be ready
log_info "Waiting for control plane to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health &>/dev/null; then
        log_success "Control plane is ready"
        break
    fi
    sleep 1
done

# Step 3: Start web dashboard (in background)
log_info "Starting web dashboard..."
cd "$REPO_ROOT/apps/web-dashboard"
pnpm dev &
DASHBOARD_PID=$!

sleep 3
log_success "Web dashboard starting at http://localhost:3001"

# Step 4: Run the game builder
cd "$DEMO_DIR"
log_info "Running game builder demo..."
echo ""

WATCH_FLAG=""
if [[ "$WATCH" == "true" ]]; then
    WATCH_FLAG="--watch"
fi

# Run the game builder CLI
pnpm tsx src/build-game.ts --repo "$REPO" --token "$TOKEN" --game "$GAME" $WATCH_FLAG

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    kill $CONTROL_PLANE_PID 2>/dev/null || true
    kill $DASHBOARD_PID 2>/dev/null || true
    log_info "Done. Infrastructure is still running."
    log_info "To stop: docker compose --profile monitoring down"
}

trap cleanup EXIT

# Keep script running to maintain background processes
log_info "Demo complete!"
log_info ""
log_info "Services running:"
log_info "  - Control Plane: http://localhost:3000"
log_info "  - Web Dashboard: http://localhost:3001"
log_info "  - Jaeger UI: http://localhost:16686"
log_info "  - Grafana: http://localhost:3001"
log_info ""
log_info "Press Ctrl+C to stop services..."
wait
