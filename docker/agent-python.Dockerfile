# Python Agent Base Dockerfile
FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install poetry
RUN pip install poetry

# Copy Python SDK files
COPY packages/sdk-python/pyproject.toml packages/sdk-python/poetry.lock* ./
COPY packages/sdk-python/src ./src

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi

# Generate proto files
COPY packages/proto/proto ./proto
COPY packages/sdk-python/generate_proto.sh ./
RUN chmod +x generate_proto.sh && ./generate_proto.sh

# Production base image for Python agents
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python environment
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /app/src /usr/local/lib/python3.11/site-packages/parallax

# Create app directory for agent code
WORKDIR /app/agent

# Default environment
ENV PYTHONUNBUFFERED=1
ENV PARALLAX_REGISTRY=control-plane:3000

# This is a base image - agents will add their own CMD
ENTRYPOINT ["tini", "--"]