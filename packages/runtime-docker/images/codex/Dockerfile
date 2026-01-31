# Parallax Codex Agent Image
#
# Docker image for running OpenAI Codex CLI as a Parallax agent.
# Codex is OpenAI's code completion and generation model.

FROM parallax/agent-base:latest

LABEL org.opencontainers.image.description="Parallax OpenAI Codex Agent"

USER root

# Install Codex CLI
# Note: OpenAI's official CLI package - adjust if package name changes
RUN npm install -g @openai/codex || \
    npm install -g openai-codex || \
    pip3 install --no-cache-dir openai && \
    echo "Installed OpenAI package for Codex access"

# Switch back to agent user
USER agent

# Codex-specific environment
ENV OPENAI_LOG=warn

# Create config directory
RUN mkdir -p /home/agent/.config/openai

# Default command
CMD ["codex"]
