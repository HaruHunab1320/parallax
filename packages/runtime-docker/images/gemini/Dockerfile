# Parallax Gemini Agent Image
#
# Docker image for running Google Gemini CLI as a Parallax agent.
# Gemini is Google's multimodal AI model.

FROM parallax/agent-base:latest

LABEL org.opencontainers.image.description="Parallax Google Gemini Agent"

USER root

# Install Gemini CLI
# Note: Google's official CLI package - adjust if package name changes
RUN npm install -g @google/gemini-cli || \
    npm install -g gemini-cli || \
    pip3 install --no-cache-dir google-generativeai && \
    echo "Installed Google Generative AI package"

# Switch back to agent user
USER agent

# Gemini-specific environment
ENV GEMINI_API_LOG_LEVEL=warn

# Create config directory
RUN mkdir -p /home/agent/.config/gemini

# Default command
CMD ["gemini"]
