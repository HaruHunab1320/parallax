# Changelog

## 0.2.0

### Added

- `connect_via_gateway(endpoint, options)` method on `ParallaxAgent` for NAT-friendly agent connections via bidirectional gRPC stream
- `GatewayOptions` struct for configuring gateway connections (heartbeat interval, reconnect, backoff)
- Auto-reconnect with exponential backoff on gateway disconnect
- Heartbeat keepalive on gateway connections
- Gateway proto compilation in build.rs

## 0.1.0

### Initial Release

- `ParallaxAgent` struct with async gRPC server and registry integration
- `AgentResult` with confidence scoring (0.0-1.0)
- `Client` with `patterns()`, `agents()`, and `executions()` service accessors
- `ConfidenceExtractor` with LLM, keywords, and hybrid strategies
- `ConfidenceAggregator` with min/max/avg/weighted/consensus strategies
- `with_confidence` wrapper and `require_confidence!` macro
- Auto-registration and lease renewal with control plane
- Comprehensive error types (`Error` enum)
- TLS support via `TlsConfig`
- Async/await API using Tokio
