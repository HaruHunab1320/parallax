#!/usr/bin/env bash
#
# Raspberry Pi Setup for Coding Swarm Demo
#
# Configures a Pi 4 with 5" Waveshare LCD for running coding agents.
# Run once on each Pi to set up hardware, dependencies, and display.
#
# Usage:
#   curl -fsSL <url>/setup-pi.sh | sudo bash -s -- --agent-type claude --agent-id vero
#
# Or locally:
#   sudo ./setup-pi.sh --agent-type claude --agent-id vero
#

set -euo pipefail

# ─── Defaults ───

AGENT_TYPE="claude"
AGENT_ID=""
DISPLAY_TYPE="dsi"    # dsi or hdmi
SKIP_REBOOT=false

# ─── Parse args ───

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --agent-id)   AGENT_ID="$2"; shift 2 ;;
    --display)    DISPLAY_TYPE="$2"; shift 2 ;;
    --skip-reboot) SKIP_REBOOT=true; shift ;;
    -h|--help)
      echo "Usage: sudo $0 [--agent-type claude|codex|gemini] [--agent-id NAME] [--display dsi|hdmi] [--skip-reboot]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$AGENT_ID" ]]; then
  echo "ERROR: --agent-id is required (e.g., vero, sable, silas)"
  exit 1
fi

echo "═══════════════════════════════════════════════════"
echo " Coding Swarm Pi Setup"
echo " Agent: $AGENT_ID ($AGENT_TYPE)"
echo " Display: 5\" Waveshare ($DISPLAY_TYPE)"
echo "═══════════════════════════════════════════════════"

# ─── 1. System updates ───

echo ""
echo ">>> Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── 2. Install essential packages ───

echo ""
echo ">>> Installing system dependencies..."
apt-get install -y -qq \
  tmux \
  git \
  curl \
  build-essential \
  libfontconfig1 \
  console-setup \
  fbset

# ─── 3. Configure 5" LCD display ───

echo ""
echo ">>> Configuring 5\" Waveshare display ($DISPLAY_TYPE)..."

BOOT_CONFIG="/boot/firmware/config.txt"
if [[ ! -f "$BOOT_CONFIG" ]]; then
  BOOT_CONFIG="/boot/config.txt"
fi

# Backup
cp "$BOOT_CONFIG" "${BOOT_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

if [[ "$DISPLAY_TYPE" == "dsi" ]]; then
  # DSI ribbon cable display
  if ! grep -q "vc4-kms-dsi" "$BOOT_CONFIG"; then
    echo "" >> "$BOOT_CONFIG"
    echo "# 5\" Waveshare DSI display for Coding Swarm" >> "$BOOT_CONFIG"
    echo "dtoverlay=vc4-kms-v3d" >> "$BOOT_CONFIG"
    echo "dtoverlay=vc4-kms-dsi-waveshare-5inch-v2" >> "$BOOT_CONFIG"
  fi
else
  # HDMI display (fallback)
  if ! grep -q "hdmi_cvt=800 480" "$BOOT_CONFIG"; then
    echo "" >> "$BOOT_CONFIG"
    echo "# 5\" Waveshare HDMI display for Coding Swarm" >> "$BOOT_CONFIG"
    echo "hdmi_group=2" >> "$BOOT_CONFIG"
    echo "hdmi_mode=87" >> "$BOOT_CONFIG"
    echo "hdmi_cvt=800 480 60 6 0 0 0" >> "$BOOT_CONFIG"
    echo "hdmi_drive=1" >> "$BOOT_CONFIG"
  fi
fi

# ─── 4. Configure console for 800x480 ───

echo ""
echo ">>> Configuring console font for 800x480..."

# Set console font: Terminus 16x32 gives ~50 cols x 15 rows (readable)
# Terminus 12x24 gives ~66 cols x 20 rows (more text)
# Terminus 8x16 gives ~100 cols x 30 rows (most text, smaller)
CONSOLE_FONT="${CONSOLE_FONT:-Uni2-Terminus16}"

cat > /etc/default/console-setup << CONSEOF
ACTIVE_CONSOLES="/dev/tty[1-6]"
CHARMAP="UTF-8"
CODESET="guess"
FONTFACE="Terminus"
FONTSIZE="16x32"
CONSEOF

# Direct console to LCD framebuffer
CMDLINE="/boot/firmware/cmdline.txt"
if [[ ! -f "$CMDLINE" ]]; then
  CMDLINE="/boot/cmdline.txt"
fi

if ! grep -q "fbcon=map:" "$CMDLINE"; then
  # Append fbcon mapping (fb0 for DSI, fb1 if HDMI is secondary)
  sed -i 's/$/ fbcon=map:0 fbcon=font:Lat15-Terminus16x32/' "$CMDLINE"
fi

# ─── 5. Install Node.js 20+ ───

echo ""
echo ">>> Installing Node.js..."

if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VERSION" -ge 20 ]]; then
    echo "Node.js $(node --version) already installed"
  else
    echo "Upgrading Node.js from v$NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  fi
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "Node.js $(node --version), npm $(npm --version)"

# Install pnpm globally
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
fi

# ─── 6. Install coding agents ───

echo ""
echo ">>> Installing coding agent CLIs..."

case "$AGENT_TYPE" in
  claude)
    echo "Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code 2>/dev/null || echo "Claude Code install failed (may need API key first)"
    ;;
  codex)
    echo "Installing OpenAI Codex CLI..."
    npm install -g @openai/codex 2>/dev/null || echo "Codex install failed"
    ;;
  gemini)
    echo "Installing Gemini CLI..."
    npm install -g @google/gemini-cli 2>/dev/null || echo "Gemini CLI install failed"
    ;;
  *)
    echo "Unknown agent type: $AGENT_TYPE (skipping CLI install)"
    ;;
esac

# ─── 7. Configure swap (4GB Pi RAM can be tight) ───

echo ""
echo ">>> Configuring swap..."

SWAP_SIZE=2048  # 2GB swap
if [[ -f /etc/dphys-swapfile ]]; then
  CURRENT_SWAP=$(grep CONF_SWAPSIZE /etc/dphys-swapfile | cut -d= -f2)
  if [[ "${CURRENT_SWAP:-0}" -lt "$SWAP_SIZE" ]]; then
    sed -i "s/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=$SWAP_SIZE/" /etc/dphys-swapfile
    systemctl restart dphys-swapfile
    echo "Swap increased to ${SWAP_SIZE}MB"
  else
    echo "Swap already ${CURRENT_SWAP}MB (sufficient)"
  fi
fi

# ─── 8. Create agent user environment ───

echo ""
echo ">>> Setting up agent environment..."

AGENT_HOME="/home/pi"
if [[ ! -d "$AGENT_HOME" ]]; then
  AGENT_HOME="$HOME"
fi

AGENT_ENV_FILE="$AGENT_HOME/.swarm-agent-env"
cat > "$AGENT_ENV_FILE" << ENVEOF
# Coding Swarm Agent Environment
# Source this file: source ~/.swarm-agent-env

export AGENT_ID="$AGENT_ID"
export AGENT_TYPE="$AGENT_TYPE"
export AGENT_NAME="$AGENT_ID"
export PARALLAX_GATEWAY="\${PARALLAX_GATEWAY:-34.58.31.212:8081}"
export TMUX_PREFIX="swarm"
export TERMINAL_COLS=100
export TERMINAL_ROWS=28
export LOG_LEVEL="info"

# Add API keys below:
# export ANTHROPIC_API_KEY="..."
# export OPENAI_API_KEY="..."
# export GEMINI_API_KEY="..."
# export GITHUB_PAT="..."
ENVEOF

# Source in .bashrc if not already there
BASHRC="$AGENT_HOME/.bashrc"
if [[ -f "$BASHRC" ]] && ! grep -q "swarm-agent-env" "$BASHRC"; then
  echo "" >> "$BASHRC"
  echo "# Coding Swarm agent environment" >> "$BASHRC"
  echo "[[ -f ~/.swarm-agent-env ]] && source ~/.swarm-agent-env" >> "$BASHRC"
fi

# ─── 9. Configure auto-login to console ───

echo ""
echo ">>> Configuring auto-login to console tty1..."

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << AUTOEOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I \$TERM
AUTOEOF

systemctl daemon-reload

# ─── 10. Create systemd service for auto-start ───

echo ""
echo ">>> Creating systemd service for swarm agent..."

cat > /etc/systemd/system/coding-swarm-agent.service << SVCEOF
[Unit]
Description=Parallax Coding Swarm Agent ($AGENT_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=$AGENT_HOME
EnvironmentFile=$AGENT_ENV_FILE
ExecStart=/usr/bin/env bash -c 'cd ~/coding-swarm/coding-swarm-agent && npx tsx src/index.ts'
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

# Don't enable yet — user should configure API keys first
echo "Service created but NOT enabled. Enable with:"
echo "  sudo systemctl enable coding-swarm-agent"
echo "  sudo systemctl start coding-swarm-agent"

# ─── Done ───

echo ""
echo "═══════════════════════════════════════════════════"
echo " Setup complete for $AGENT_ID ($AGENT_TYPE)"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Edit ~/.swarm-agent-env and add your API keys"
echo "  2. Clone the demo agent code:"
echo "     cd ~ && git clone <repo> coding-swarm"
echo "     cd coding-swarm/coding-swarm-agent && pnpm install"
echo "  3. Test manually: ./start-agent.sh"
echo "  4. Enable auto-start: sudo systemctl enable coding-swarm-agent"

if [[ "$SKIP_REBOOT" == "false" ]]; then
  echo ""
  echo "A reboot is required for display changes. Rebooting in 5 seconds..."
  echo "(Press Ctrl+C to cancel)"
  sleep 5
  reboot
else
  echo ""
  echo "NOTE: Reboot required for display changes (--skip-reboot was set)"
fi
