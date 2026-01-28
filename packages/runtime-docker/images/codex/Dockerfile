# Parallax Codex Agent Image
#
# Docker image for running OpenAI Codex CLI as a Parallax agent.

FROM parallax/agent-base:latest

USER root

# Install Codex CLI
RUN npm install -g @openai/codex

# Switch back to agent user
USER agent

# Default command runs Codex
CMD ["codex"]
