# Project89 Monorepo — Architectural Overview

## Repo Snapshot
- **Monorepo** managed with pnpm workspaces + Turbo.
- **Apps** live under `apps/`, shared libraries under `packages/`.
- **Infrastructure** defined in `terraform/` with Docker build/deploy scripts at root.

## High-Level System Map
```text
                          ┌──────────────────────────────┐
                          │         PostgreSQL           │
                          │     Prisma + ZenStack        │
                          └──────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────┐    REST       │        Jobs        ┌─────────────────────┐
│ Proxim8 Client      │──────────────▶│◀───────────────────│ Proxim8 Worker      │
│ Next.js UI + Proxy  │               │                    │ BullMQ Processors   │
└──────────┬──────────┘               │                    └──────────┬──────────┘
           │                          │                               │
           │ Socket.IO                │                               │
           ▼                          │                               ▼
┌─────────────────────┐         ┌──────────────────┐           ┌─────────────────────┐
│ WebSocket Service   │◀────────│ Redis            │──────────▶│ External AI/Storage │
│ Auth + Pub/Sub      │         │ Queue/PubSub/Cache│          │ (OpenAI/Gemini/GCS) │
└─────────────────────┘         └──────────────────┘           └─────────────────────┘

Additional web properties:
- FlagAI marketing site (Next.js)
- Imaginal.media site (Next.js)
- FlagAI detector service (FastAPI)
```

## Applications

### `apps/server` — API Server (Express)
- Central REST API for missions, auth, notifications, credits, lore, NFTs, Stripe, Solana Pay, etc.
- Prisma + ZenStack for database access + model-level access control.
- BullMQ queue producer (mission deployments, AI jobs) using Redis DB1.
- Health + metrics endpoints, rate limiting, structured middleware stack.
- Loads root `.env.local` + app-specific `.env` locally; Cloud Run uses injected env vars.

### `apps/proxim8-client` — Proxim8 Mission UI (Next.js)
- Next.js app with portal/missions/lore/training experiences.
- API proxy route (`/api/[...path]`) forwards to API server and forwards cookies/headers.
- Socket.IO client for real-time mission state with token-based fallback for cross-origin WebSockets.
- Custom Node server option embeds Socket.IO for same-origin dev.

### `apps/proxim8-worker` — Background Processing
- BullMQ worker consuming mission + media generation jobs.
- Processor registry for mission deployment, phase generation, timeline impact, image/video tasks, cleanup.
- Health/ops server with `/health`, `/stats`, and admin controls.

### `apps/proxim8-websocket` — WebSocket Service
- Dedicated Socket.IO server (Cloud Run friendly) with CORS allow-list.
- Auth supports cookies (same-origin) and token auth (cross-origin).
- Subscribes to Redis pub/sub channels and emits mission/user events to rooms.

### `apps/flagai.ca` — FlagAI Site (Next.js)
- Marketing + product pages for FlagAI.

### `apps/imaginal.media` — Imaginal Media Site (Next.js)
- Marketing site with product, FAQ, legal pages.

### `apps/flagai-detector` — Media Detection (Python/FastAPI)
- Detector service with a lightweight API and CLI for media analysis.

## Shared Packages

### `packages/database`
- Prisma + ZenStack schema, migrations, and generated client.
- Scripts for seeding, imports, and migrations.

### `packages/hooks`
- Generated ZenStack + TanStack Query hooks for React clients.

### `packages/game-utils`
- Mission/game mechanics (success rate, compatibility, timeline calculations).

### `packages/pipeline`
- AI pipeline core, middleware, and services for narrative/image/video generation.
- Used by worker (and server where needed) to keep AI logic centralized.

## Cross-Cutting Patterns
- **Auth**: JWT cookies + API key fallback for some routes; WebSocket auth via cookies or token.
- **Queues**: BullMQ in Redis DB1; worker handles long-running jobs.
- **Real-time**: Redis pub/sub (DB2) + Socket.IO rooms for mission updates.
- **Data Access**: Prisma + ZenStack; generated hooks for client consumption.
- **Deployment**: Dockerfiles for services, Terraform for infra, Cloud Run for server/websocket/worker; Netlify configs for web clients.

## Notable Design Choices
- Clear separation of API, background work, and WebSocket delivery for scalability.
- Shared AI pipeline package keeps mission generation consistent across services.
- Next.js API proxy lets the client run behind a single origin while still hitting the API server.
- Redis DB partitioning for queue/pub-sub/cache minimizes cross-talk between concerns.

## Portfolio Sound-Bites
- “Monorepo with multiple production apps, shared AI pipeline, and a job-driven mission engine.”
- “Real-time mission orchestration using BullMQ + Redis pub/sub + Socket.IO.”
- “Cloud Run + Terraform deployment pipeline with modular infra.”
