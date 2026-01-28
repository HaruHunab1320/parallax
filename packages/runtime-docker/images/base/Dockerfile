# Parallax Agent Base Image
#
# Base image for CLI agents with PTY wrapper and common utilities.

FROM node:20-alpine

# Install common dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    py3-pip \
    openssh-client \
    && rm -rf /var/cache/apk/*

# Create agent user
RUN adduser -D -h /home/agent agent

# Create working directories
RUN mkdir -p /workspace /tmp/agent && \
    chown -R agent:agent /workspace /tmp/agent

# Install agent wrapper script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set environment
ENV HOME=/home/agent
ENV TERM=xterm-256color

WORKDIR /workspace
USER agent

ENTRYPOINT ["/entrypoint.sh"]
