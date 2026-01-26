# Stage 1: Prune the monorepo for control-plane
FROM node:20-alpine AS pruner

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .

# Use turbo prune to create a pruned workspace
RUN turbo prune @parallax/control-plane --docker

# Stage 2: Install dependencies and build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g turbo

WORKDIR /app

# Copy pruned lockfile and package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies (standard pnpm structure)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --from=pruner /app/out/full/ .

# Copy root tsconfig
COPY tsconfig.json ./

# Build with turbo
RUN turbo build --filter=@parallax/control-plane

# Generate Prisma client
WORKDIR /app/packages/control-plane
RUN pnpm exec prisma generate

# Stage 3: Production - preserve pnpm workspace structure
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S parallax && \
    adduser -S parallax -u 1001 -G parallax

# Copy the entire pnpm structure (root + packages)
# The .pnpm store in root node_modules is the source of truth
COPY --from=builder /app/node_modules ./node_modules

# Copy packages with their local node_modules (symlinks to .pnpm)
COPY --from=builder /app/packages/control-plane ./packages/control-plane
COPY --from=builder /app/packages/runtime ./packages/runtime
COPY --from=builder /app/packages/telemetry ./packages/telemetry

# Copy proto files for gRPC
COPY --from=pruner /app/proto ./proto

# Remove development .env files (env vars should come from K8s/container runtime)
RUN rm -f /app/packages/control-plane/.env

# Create patterns directory
RUN mkdir -p /patterns && chown parallax:parallax /patterns

# Set working directory to control-plane package
WORKDIR /app/packages/control-plane

# Switch to non-root user
USER parallax

# Expose ports
EXPOSE 3000 3001 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Start the application
CMD ["node", "dist/server.js"]
