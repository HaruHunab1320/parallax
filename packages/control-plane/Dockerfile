# Multi-stage build for production-ready control plane image
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files for dependency resolution
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./

# Stage 1: Dependencies
FROM base AS deps

# Copy package files from all packages (control-plane and its dependencies)
COPY packages/control-plane/package.json packages/control-plane/
COPY packages/runtime/package.json packages/runtime/
COPY packages/telemetry/package.json packages/telemetry/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @parallax/control-plane...

# Stage 2: Build
FROM base AS builder

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy root configuration files
COPY tsconfig.json ./
COPY turbo.json ./

# Copy source code
COPY packages/control-plane ./packages/control-plane
COPY packages/runtime ./packages/runtime
COPY packages/telemetry ./packages/telemetry

# Generate Prisma client
WORKDIR /app/packages/control-plane
RUN npx prisma generate

# Build all packages
WORKDIR /app
RUN pnpm --filter @parallax/control-plane... run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache libc6-compat postgresql-client

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=nodejs:nodejs /app/packages/control-plane/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/control-plane/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/control-plane/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/packages/control-plane/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/packages/control-plane/patterns ./patterns

# Copy runtime and telemetry packages
COPY --from=builder --chown=nodejs:nodejs /app/packages/runtime/dist ../runtime/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/runtime/package.json ../runtime/
COPY --from=builder --chown=nodejs:nodejs /app/packages/telemetry/dist ../telemetry/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/telemetry/package.json ../telemetry/

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 8080 8081 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    METRICS_PORT=9090 \
    GRPC_PORT=8081

# Start the application
CMD ["node", "dist/server.js"]