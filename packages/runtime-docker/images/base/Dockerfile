# Parallax Agent Base Image
#
# Base image for CLI agents with PTY wrapper and common utilities.
# All agent images (claude, codex, gemini, aider) inherit from this.

FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/parallax/parallax"
LABEL org.opencontainers.image.description="Parallax Agent Base Image"
LABEL org.opencontainers.image.vendor="Parallax"

# Install common dependencies for coding agents
RUN apk add --no-cache \
    bash \
    curl \
    wget \
    git \
    git-lfs \
    python3 \
    py3-pip \
    openssh-client \
    jq \
    ripgrep \
    fd \
    tree \
    make \
    gcc \
    g++ \
    musl-dev \
    linux-headers \
    && rm -rf /var/cache/apk/*

# Install common Node.js tools
RUN npm install -g \
    typescript \
    ts-node \
    prettier \
    eslint

# Create agent user (non-root for security)
RUN adduser -D -h /home/agent -s /bin/bash agent

# Create working directories
RUN mkdir -p /workspace /tmp/agent /home/agent/.config && \
    chown -R agent:agent /workspace /tmp/agent /home/agent

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set environment for better CLI experience
ENV HOME=/home/agent
ENV TERM=xterm-256color
ENV SHELL=/bin/bash
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Git configuration for commits
RUN git config --system user.email "agent@parallax.ai" && \
    git config --system user.name "Parallax Agent"

WORKDIR /workspace
USER agent

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD echo "healthy" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
