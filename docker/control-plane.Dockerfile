# Control Plane Dockerfile
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/control-plane/package.json ./packages/control-plane/
COPY packages/proto/package.json ./packages/proto/
COPY packages/data-plane/package.json ./packages/data-plane/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/runtime ./packages/runtime
COPY packages/control-plane ./packages/control-plane
COPY packages/proto ./packages/proto
COPY packages/data-plane ./packages/data-plane
COPY tsconfig.json ./

# Build
RUN pnpm --filter @parallax/control-plane build

# Production image
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/packages/control-plane/dist ./dist
COPY --from=builder /app/packages/control-plane/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Copy patterns
COPY patterns /app/patterns

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PARALLAX_PATTERNS_DIR=/app/patterns
ENV PARALLAX_ETCD_ENDPOINTS=etcd:2379

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]