# Changelog

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
