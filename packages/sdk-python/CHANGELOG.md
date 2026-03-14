# Changelog

## 0.2.0

### Added

- `connect_via_gateway(endpoint, options)` method on `ParallaxAgent` for NAT-friendly agent connections via bidirectional gRPC stream
- `GatewayOptions` dataclass for configuring gateway connections (heartbeat, reconnect, backoff)
- Auto-reconnect with exponential backoff on gateway disconnect
- Heartbeat keepalive on gateway connections
- `PatternClient` for executing and managing orchestration patterns via gRPC
- `ExecutionClient` for tracking and streaming execution status via gRPC
- Generated proto stubs for `gateway.proto` and `executions.proto`

## 0.1.0

### Initial Release

- `ParallaxAgent` base class with async gRPC server and registry integration
- Confidence scoring via `AnalyzeResult` tuple (result, confidence)
- `with_confidence` and `require_confidence` decorators for automatic confidence extraction
- `ConfidenceAggregator` with min/max/avg/weighted/consensus strategies
- Health checks and capability reporting
- Auto-registration and lease renewal with control plane
- `serve_agent()` and `create_and_serve()` convenience functions
