# Stage 1: Prune the monorepo for runtime-k8s
FROM node:24.20.0-alpine AS pruner

RUN npm install --global pnpm@10.11.0
RUN npm install --global turbo@2.5.5

WORKDIR /app
COPY . .

# Use turbo prune to create a pruned workspace
RUN turbo prune @parallaxai/runtime-k8s --docker

# Stage 2: Install dependencies and build
FROM node:24.20.0-alpine AS builder

RUN npm install --global pnpm@10.11.0
RUN npm install --global turbo@2.5.5

WORKDIR /app

# Copy pruned lockfile and package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --from=pruner /app/out/full/ .

# Copy root tsconfig
COPY tsconfig.json ./

# Build with turbo
RUN turbo build --filter=@parallaxai/runtime-k8s

# Stage 3: Production
FROM node:24.20.0-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S parallax && \
    adduser -S parallax -u 1001 -G parallax

# Copy the pnpm structure
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/runtime-k8s ./packages/runtime-k8s
COPY --from=builder /app/packages/runtime-interface ./packages/runtime-interface

WORKDIR /app/packages/runtime-k8s

USER parallax

EXPOSE 9878

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9878/health || exit 1

CMD ["node", "dist/cli.js"]
