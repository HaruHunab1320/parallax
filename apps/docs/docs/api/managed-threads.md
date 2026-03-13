---
sidebar_position: 2
title: Managed Threads API
---

# Managed Threads API

Managed threads expose Parallax's long-lived orchestration layer over REST.

Use these endpoints when you want the control plane to supervise a coding worker, preserve thread state, and attach preparation or memory before execution starts.

## Base URL

```text
https://your-control-plane.example.com/api/managed-threads
```

Local development:

```text
http://localhost:8080/api/managed-threads
```

## Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/managed-threads` | List threads |
| `POST` | `/api/managed-threads` | Spawn a thread |
| `POST` | `/api/managed-threads/prepare` | Build preparation without spawning |
| `GET` | `/api/managed-threads/:id` | Get thread state |
| `DELETE` | `/api/managed-threads/:id` | Stop a thread |
| `POST` | `/api/managed-threads/:id/send` | Send input to a thread |
| `GET` | `/api/managed-threads/:id/events` | Read persisted thread events |
| `GET` | `/api/managed-threads/:id/shared-decisions` | Read thread decisions |
| `POST` | `/api/managed-threads/:id/shared-decisions` | Record a shared decision manually |
| `GET` | `/api/managed-threads/executions/:executionId` | List threads for one execution |
| `GET` | `/api/managed-threads/executions/:executionId/shared-decisions` | List decisions for one execution |
| `GET` | `/api/managed-threads/experiences` | Query episodic experiences |

## Spawn a Thread

```http
POST /api/managed-threads
```

```json
{
  "executionId": "exec_auth_refactor",
  "name": "auth-controller-thread",
  "agentType": "codex",
  "role": "engineer",
  "objective": "Refactor the auth controller and keep callbacks working",
  "preparation": {
    "workspace": {
      "repo": "acme/auth-service",
      "branch": "feature/auth-refactor"
    },
    "approvalPreset": "standard",
    "env": {
      "PARALLAX_EXECUTION_ID": "exec_auth_refactor"
    }
  },
  "policy": {
    "idleTimeoutMs": 300000,
    "summarizeAfterTurns": 2
  },
  "metadata": {
    "source": "manual"
  }
}
```

Parallax may enrich this request with:

- provisioned workspace details
- memory files
- shared-decision context
- retrieved episodic experiences

## Prepare Without Spawning

```http
POST /api/managed-threads/prepare
```

This endpoint returns the normalized preparation payload the control plane would apply to a spawn request.

Typical uses:

- inspect generated memory/context files
- verify workspace resolution before running a worker
- debug preparation policy without consuming runtime capacity

Example response:

```json
{
  "executionId": "exec_auth_refactor",
  "name": "auth-controller-thread",
  "objective": "Refactor the auth controller and keep callbacks working",
  "role": "engineer",
  "preparation": {
    "workspace": {
      "workspaceId": "ws_123",
      "path": "/var/parallax/workspaces/ws_123",
      "repo": "acme/auth-service",
      "branch": "feature/auth-refactor"
    },
    "contextFiles": [
      {
        "path": ".parallax/thread-memory.md",
        "content": "# Parallax Thread Memory\n..."
      }
    ],
    "approvalPreset": "standard"
  },
  "metadata": {
    "memoryContext": {
      "sharedDecisionCount": 3,
      "episodicExperienceCount": 2,
      "repo": "acme/auth-service",
      "role": "engineer",
      "objective": "Refactor the auth controller and keep callbacks working"
    }
  }
}
```

## Send Input

```http
POST /api/managed-threads/:id/send
```

```json
{
  "message": "Continue with the callback extraction and summarize blockers."
}
```

You can also send raw terminal input or key presses:

```json
{
  "raw": "\u0003"
}
```

```json
{
  "keys": ["ENTER"]
}
```

## Thread Events

Persisted thread events include:

- `thread_started`
- `thread_ready`
- `thread_blocked`
- `thread_tool_running`
- `thread_turn_complete`
- `thread_idle`
- `thread_summary_updated`
- `thread_completed`
- `thread_failed`
- `thread_stopped`

## Shared Decisions and Experiences

Managed threads are also the API surface for Parallax memory:

- shared decisions compress important current-execution findings
- episodic experiences capture successful, partial, and failed prior work

These are used by thread preparation to build ranked memory context for future spawns.
