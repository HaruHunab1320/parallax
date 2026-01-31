# Parallax Aider Agent Image
#
# Docker image for running Aider AI coding assistant as a Parallax agent.

FROM parallax/agent-base:latest

USER root

# Install Aider via pip
RUN pip3 install --no-cache-dir aider-chat

# Switch back to agent user
USER agent

# Set Aider-specific environment
ENV AIDER_NO_AUTO_COMMITS=true
ENV AIDER_YES=true

# Default command runs Aider
CMD ["aider", "--no-auto-commits"]
