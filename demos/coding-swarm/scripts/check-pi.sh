#!/usr/bin/env bash
#
# Pre-flight check for Coding Swarm Pi
#
# Verifies that a Pi is correctly set up for the demo.
# Run on each Pi before the demo to catch issues.
#
# Usage: ./check-pi.sh [--agent-type claude]
#

set -euo pipefail

AGENT_TYPE="${1:-${AGENT_TYPE:-claude}}"
ERRORS=0
WARNINGS=0

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo "  ✗ $1"; ERRORS=$((ERRORS + 1)); }

echo "═══════════════════════════════════════════════════"
echo " Coding Swarm Pi Pre-flight Check"
echo " Agent type: $AGENT_TYPE"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── System ───
echo "System:"

# Node.js
if command -v node &>/dev/null; then
  NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VER" -ge 20 ]]; then
    ok "Node.js $(node --version)"
  else
    fail "Node.js $(node --version) (need v20+)"
  fi
else
  fail "Node.js not installed"
fi

# npm / pnpm
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm --version)"
elif command -v npm &>/dev/null; then
  warn "pnpm not found (using npm $(npm --version))"
else
  fail "No package manager found"
fi

# tmux
if command -v tmux &>/dev/null; then
  ok "tmux $(tmux -V | awk '{print $2}')"
else
  fail "tmux not installed"
fi

# git
if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  fail "git not installed"
fi

# ─── Memory ───
echo ""
echo "Resources:"

TOTAL_MEM=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo "unknown")
if [[ "$TOTAL_MEM" != "unknown" ]]; then
  if [[ "$TOTAL_MEM" -ge 3500 ]]; then
    ok "RAM: ${TOTAL_MEM}MB"
  else
    warn "RAM: ${TOTAL_MEM}MB (recommend 4GB+)"
  fi
fi

SWAP=$(free -m 2>/dev/null | awk '/Swap/ {print $2}' || echo "0")
if [[ "$SWAP" -ge 1024 ]]; then
  ok "Swap: ${SWAP}MB"
elif [[ "$SWAP" -gt 0 ]]; then
  warn "Swap: ${SWAP}MB (recommend 2GB+)"
else
  warn "No swap configured (recommend 2GB for coding agents)"
fi

DISK_FREE=$(df -BM / 2>/dev/null | awk 'NR==2 {gsub(/M/,"",$4); print $4}' || echo "unknown")
if [[ "$DISK_FREE" != "unknown" ]]; then
  if [[ "$DISK_FREE" -ge 5000 ]]; then
    ok "Disk free: ${DISK_FREE}MB"
  else
    warn "Disk free: ${DISK_FREE}MB (need 5GB+ for workspaces)"
  fi
fi

# ─── Display ───
echo ""
echo "Display:"

# Check for framebuffer devices
FB_COUNT=$(ls /dev/fb* 2>/dev/null | wc -l)
if [[ "$FB_COUNT" -gt 0 ]]; then
  for fb in /dev/fb*; do
    FBSIZE=$(fbset -fb "$fb" -s 2>/dev/null | awk '/geometry/ {print $2 "x" $3}' || echo "?")
    ok "Framebuffer: $fb ($FBSIZE)"
  done
else
  warn "No framebuffer devices found (display may not be configured)"
fi

# Check boot config for display overlay
BOOT_CONFIG="/boot/firmware/config.txt"
if [[ ! -f "$BOOT_CONFIG" ]]; then
  BOOT_CONFIG="/boot/config.txt"
fi

if [[ -f "$BOOT_CONFIG" ]]; then
  if grep -q "waveshare\|hdmi_cvt=800" "$BOOT_CONFIG"; then
    ok "Display overlay configured in $BOOT_CONFIG"
  else
    warn "No display overlay found in $BOOT_CONFIG"
  fi
fi

# ─── Coding Agent ───
echo ""
echo "Coding Agent ($AGENT_TYPE):"

case "$AGENT_TYPE" in
  claude)
    if command -v claude &>/dev/null; then
      ok "Claude Code CLI found"
    else
      fail "Claude Code CLI not installed (npm install -g @anthropic-ai/claude-code)"
    fi
    if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
      ok "ANTHROPIC_API_KEY is set"
    else
      fail "ANTHROPIC_API_KEY not set"
    fi
    ;;
  codex)
    if command -v codex &>/dev/null; then
      ok "Codex CLI found"
    else
      fail "Codex CLI not installed (npm install -g @openai/codex)"
    fi
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
      ok "OPENAI_API_KEY is set"
    else
      fail "OPENAI_API_KEY not set"
    fi
    ;;
  gemini)
    if command -v gemini &>/dev/null; then
      ok "Gemini CLI found"
    else
      fail "Gemini CLI not installed (npm install -g @google/gemini-cli)"
    fi
    if [[ -n "${GEMINI_API_KEY:-}" ]]; then
      ok "GEMINI_API_KEY is set"
    else
      fail "GEMINI_API_KEY not set"
    fi
    ;;
  *)
    warn "Unknown agent type: $AGENT_TYPE"
    ;;
esac

# GitHub PAT
if [[ -n "${GITHUB_PAT:-}" ]]; then
  ok "GITHUB_PAT is set"
else
  warn "GITHUB_PAT not set (needed for private repo workspace provisioning)"
fi

# ─── Network ───
echo ""
echo "Network:"

GATEWAY="${PARALLAX_GATEWAY:-34.58.31.212:8081}"
GW_HOST="${GATEWAY%:*}"
GW_PORT="${GATEWAY#*:}"

if timeout 3 bash -c "echo >/dev/tcp/$GW_HOST/$GW_PORT" 2>/dev/null; then
  ok "Gateway reachable at $GATEWAY"
else
  fail "Cannot reach gateway at $GATEWAY"
fi

# ─── Agent Environment ───
echo ""
echo "Agent Environment:"

if [[ -f "$HOME/.swarm-agent-env" ]]; then
  ok "Environment file: ~/.swarm-agent-env"
else
  warn "No ~/.swarm-agent-env file (run setup-pi.sh)"
fi

if [[ -n "${AGENT_ID:-}" ]]; then
  ok "AGENT_ID=$AGENT_ID"
else
  warn "AGENT_ID not set"
fi

# ─── Summary ───
echo ""
echo "═══════════════════════════════════════════════════"
if [[ "$ERRORS" -eq 0 ]] && [[ "$WARNINGS" -eq 0 ]]; then
  echo " All checks passed! Ready for demo."
elif [[ "$ERRORS" -eq 0 ]]; then
  echo " $WARNINGS warning(s), 0 errors. Likely OK for demo."
else
  echo " $ERRORS error(s), $WARNINGS warning(s). Fix errors before demo."
fi
echo "═══════════════════════════════════════════════════"

exit "$ERRORS"
