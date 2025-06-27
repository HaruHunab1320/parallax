# TypeScript Agent Base Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sdk-typescript/package.json ./packages/sdk-typescript/
COPY packages/proto/package.json ./packages/proto/
COPY packages/runtime/package.json ./packages/runtime/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy SDK source
COPY packages/sdk-typescript ./packages/sdk-typescript
COPY packages/proto ./packages/proto
COPY packages/runtime ./packages/runtime
COPY tsconfig.json ./

# Build SDK
RUN pnpm --filter @parallax/sdk-typescript build

# Production base image for TypeScript agents
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy SDK and dependencies
COPY --from=builder /app/packages/sdk-typescript/dist ./node_modules/@parallax/sdk-typescript/dist
COPY --from=builder /app/packages/sdk-typescript/package.json ./node_modules/@parallax/sdk-typescript/
COPY --from=builder /app/node_modules ./node_modules

# Create app directory for agent code
WORKDIR /app/agent

# Default environment
ENV NODE_ENV=production

# This is a base image - agents will add their own CMD
ENTRYPOINT ["/sbin/tini", "--"]