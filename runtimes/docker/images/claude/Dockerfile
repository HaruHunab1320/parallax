# Parallax Claude Agent Image
#
# Docker image for running Claude Code CLI as a Parallax agent.

FROM parallax/agent-base:latest

USER root

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Switch back to agent user
USER agent

# Set Claude-specific environment
ENV CLAUDE_CODE_TELEMETRY=false

# Default command runs Claude
CMD ["claude", "--print"]
