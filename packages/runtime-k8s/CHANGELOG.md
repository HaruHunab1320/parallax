# Changelog

## [0.2.0] - 2026-03-20

### Added

- Thread API support (`/api/threads` routes) to `RuntimeServer`:
  - `GET /api/threads` — list threads with optional filters (`executionId`, `status`, `role`, `agentType`)
  - `GET /api/threads/:id` — get thread by ID
  - `POST /api/threads` — spawn a new thread (backed by a K8s ParallaxAgent pod)
  - `DELETE /api/threads/:id` — stop a thread and its underlying agent pod
  - `POST /api/threads/:id/send` — send a message/keys to a running thread
- Thread methods on `K8sRuntime`:
  - `spawnThread(input)` — creates a K8s agent pod from thread input, returns a `ThreadHandle`
  - `getThread(id)` — returns thread handle with live status synced from the underlying agent
  - `listThreads(filter?)` — returns all tracked threads, optionally filtered
  - `stopThread(id, options?)` — stops the underlying agent pod and removes the thread
  - `sendToThread(id, input)` — forwards message/raw/keys to the underlying agent
- Agent type alias resolution: `'claude-code'` maps to `'claude'`; unknown types fall back to `'custom'`

### Fixed

- Removed unused `EventEmitter` import
- Removed unused `appsApi` field (reserved for future Deployment management)

## [0.1.0] - Initial release

- Kubernetes runtime provider managing CLI agents as `ParallaxAgent` CRD resources
- `GET /api/agents`, `POST /api/agents`, `DELETE /api/agents/:id`, `POST /api/agents/:id/send`, `GET /api/agents/:id/logs`, `GET /api/agents/:id/metrics`
- Shared auth PVC per execution for OAuth credential sharing across swarm agents
- K8s watcher for live agent status sync
