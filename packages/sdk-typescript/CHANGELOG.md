# Changelog

## 0.4.0

### Added

- **Gateway Thread Protocol** — 6 new proto message types extending the bidirectional gateway stream for long-lived thread lifecycle management (`ThreadSpawnRequest`, `ThreadSpawnResult`, `ThreadEventReport`, `ThreadInputRequest`, `ThreadStopRequest`, `ThreadStatusUpdate`)
- `handleGatewayThreadSpawn()`, `handleGatewayThreadInput()`, `handleGatewayThreadStop()` — protected handler methods on `ParallaxAgent` that subclasses override to manage local coding agent threads
- `emitThreadEvent()` and `emitThreadStatusUpdate()` — protected helpers for streaming thread lifecycle events back through the gateway
- `registerThread()` and `unregisterThread()` — thread tracking with automatic cleanup on disconnect/shutdown
- `GatewayThreadSpawnRequest`, `GatewayThreadSpawnResult`, `GatewayThreadEvent`, `GatewayThreadInput`, `GatewayThreadStopRequest`, `GatewayThreadStatusUpdate` — TypeScript interfaces exported from `types/thread-types`

### Changed

- `handleGatewayTask()` changed from `private` to `protected` to allow subclass override

## 0.3.0

### Added

- `CoordinatorServiceClient` for direct coordination requests
- `PatternClient` with `upload()` and `streamExecute()` methods
- `ExecutionClient` with `streamEvents()` for real-time execution tracking
- `EpistemicOrchestrator` and `ConsensusBuilder` orchestration patterns
- `SecureParallaxAgent` with mTLS certificate rotation

### Notes

- All four agent SDKs (TypeScript, Python, Go, Rust) now support gateway connection for NAT traversal
- See `@parallaxai/client` for management SDK (REST API wrapper)

## 0.2.1

### Bug Fixes

- Fixed proto file resolution path — `PROTO_DIR` now correctly resolves to `<package-root>/proto` when installed as a dependency (was resolving to `dist/proto` which doesn't exist)

### Added

- Bundled `gateway.proto` in the published package, enabling `connectViaGateway()` to work out of the box without manually providing proto files

## 0.2.0

### Added

- `connectViaGateway(endpoint, options?)` method on `ParallaxAgent` for connecting to the control plane via bidirectional gRPC stream (NAT traversal, no public endpoint needed)
- Auto-reconnect with exponential backoff on gateway disconnect
- Heartbeat keepalive on gateway connections

## 0.1.0

### Initial Release

- `ParallaxAgent` base class with gRPC server and registry integration
- `AgentResponse` with confidence scoring via `@prism-lang/confidence`
- Proto-based service definitions for `ConfidenceAgent` and `Registry`
- `serve()` method for local gRPC agent hosting
- Agent registration and lease renewal with control plane
