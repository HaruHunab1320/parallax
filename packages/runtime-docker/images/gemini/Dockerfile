# Parallax Gemini Agent Image
#
# Docker image for running Google Gemini CLI as a Parallax agent.

FROM parallax/agent-base:latest

USER root

# Install Gemini CLI
RUN npm install -g @anthropic-ai/gemini-cli || npm install -g gemini-cli || echo "Gemini CLI not yet available, using placeholder"

# Switch back to agent user
USER agent

# Default command
CMD ["gemini"]
