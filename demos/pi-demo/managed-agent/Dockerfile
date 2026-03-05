# Stage 1: Build within monorepo context
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config, lockfile, and root tsconfig
COPY pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy package.json files for relevant packages
COPY demos/pi-demo/managed-agent/package.json demos/pi-demo/managed-agent/
COPY packages/sdk-typescript/package.json packages/sdk-typescript/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter parallax-agent-demo... || pnpm install --no-frozen-lockfile --filter parallax-agent-demo...

# Copy source for SDK
COPY packages/sdk-typescript/ packages/sdk-typescript/

# Build SDK first
RUN cd packages/sdk-typescript && pnpm build

# Copy managed agent source
COPY demos/pi-demo/managed-agent/ demos/pi-demo/managed-agent/

# Build managed agent
RUN cd demos/pi-demo/managed-agent && pnpm build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

RUN addgroup -g 1001 -S parallax && \
    adduser -S parallax -u 1001 -G parallax

# Copy built managed agent code
COPY --from=builder /app/demos/pi-demo/managed-agent/dist ./dist
COPY --from=builder /app/demos/pi-demo/managed-agent/package.json ./

# Copy built SDK
COPY --from=builder /app/packages/sdk-typescript/dist ./sdk/dist
COPY --from=builder /app/packages/sdk-typescript/package.json ./sdk/
COPY --from=builder /app/packages/sdk-typescript/proto ./sdk/proto

# Install production deps fresh (express + SDK's deps)
RUN npm install --omit=dev express@^4.21.2 @grpc/grpc-js @grpc/proto-loader google-protobuf

# Link the SDK so require('@parallaxai/sdk-typescript') works
RUN mkdir -p node_modules/@parallaxai/sdk-typescript && \
    cp -r sdk/dist sdk/package.json sdk/proto node_modules/@parallaxai/sdk-typescript/

# Set proto dir
ENV PARALLAX_PROTO_DIR=/app/node_modules/@parallaxai/sdk-typescript/proto

USER parallax
EXPOSE 8080 8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
