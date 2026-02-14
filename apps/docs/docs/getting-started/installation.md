---
sidebar_position: 1
title: Installation
---

# Installation

Get Parallax up and running in your project.

## Prerequisites

- **Node.js** 18+ (for TypeScript SDK)
- **Docker** (optional, for containerized deployment)

## Install the SDK

```bash
npm install @parallax/sdk-typescript
```

Or with other package managers:

```bash
# yarn
yarn add @parallax/sdk-typescript

# pnpm
pnpm add @parallax/sdk-typescript
```

## Start the Control Plane

The control plane is the orchestration server that coordinates agents and executes patterns.

### Option 1: Docker (Recommended)

```bash
docker run -p 8080:8080 parallax/control-plane:latest
```

### Option 2: From Source

```bash
git clone https://github.com/HaruHunab1320/parallax.git
cd parallax
pnpm install
pnpm --filter @parallax/control-plane dev
```

## Verify Installation

Check that the control plane is running:

```bash
curl http://localhost:8080/health
```

You should see:

```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

## Next Steps

- [Quickstart Guide](/docs/getting-started/quickstart) - Run your first pattern
- [Core Concepts](/docs/getting-started/concepts) - Learn how Parallax works
