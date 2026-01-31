# Parallax Claude Agent Image
#
# Docker image for running Claude Code CLI as a Parallax agent.
# Claude Code is Anthropic's official AI coding assistant.

FROM parallax/agent-base:latest

LABEL org.opencontainers.image.description="Parallax Claude Code Agent"

USER root

# Install Claude Code CLI
# Note: The package name may vary - adjust as needed
RUN npm install -g @anthropic-ai/claude-code || \
    npm install -g claude-code || \
    echo "Warning: Claude Code CLI package not found, agent may need manual setup"

# Switch back to agent user
USER agent

# Claude-specific environment
ENV CLAUDE_CODE_TELEMETRY=false
ENV CLAUDE_CODE_DISABLE_INTERACTIVE=true

# Create config directory
RUN mkdir -p /home/agent/.config/claude

# Default command runs Claude in print mode (non-interactive)
CMD ["claude", "--print"]
