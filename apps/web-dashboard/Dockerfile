# Stage 1: Prune the monorepo for web-dashboard
FROM node:20-alpine AS pruner

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g turbo

WORKDIR /app
COPY . .

# Use turbo prune to create a pruned workspace
RUN turbo prune @parallax/web-dashboard --docker

# Stage 2: Install dependencies and build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy pruned lockfile and package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --from=pruner /app/out/full/ .

# Build the Next.js app
WORKDIR /app/apps/web-dashboard
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: Production (using standalone output)
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S parallax && \
    adduser -S parallax -u 1001 -G parallax

# Copy standalone build
COPY --from=builder /app/apps/web-dashboard/.next/standalone ./
COPY --from=builder /app/apps/web-dashboard/.next/static ./apps/web-dashboard/.next/static
COPY --from=builder /app/apps/web-dashboard/public ./apps/web-dashboard/public

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

# Switch to non-root user
USER parallax

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002 || exit 1

# Start the application (standalone server)
CMD ["node", "apps/web-dashboard/server.js"]
