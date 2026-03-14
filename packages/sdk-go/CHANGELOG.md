# Changelog

## 0.2.0

### Added

- `ConnectViaGateway(endpoint, opts)` method on `ParallaxAgent` for NAT-friendly agent connections via bidirectional gRPC stream
- `GatewayOptions` struct for configuring gateway connections (heartbeat interval, reconnect, backoff)
- Auto-reconnect with exponential backoff on gateway disconnect
- Heartbeat keepalive on gateway connections
- Generated proto stubs for `gateway.proto`

## 0.1.0

### Initial Release

- `ParallaxAgent` base struct with gRPC server and registry integration
- `AgentResult` with confidence scoring (0.0-1.0)
- `Client` with `Patterns()`, `Agents()`, and `Executions()` service accessors
- `ConfidenceExtractor` with LLM, keywords, and hybrid strategies
- `ConfidenceAggregator` with min/max/avg/weighted/consensus strategies
- `WithConfidence` and `RequireMinimumConfidence` function wrappers
- Auto-registration and lease renewal with control plane
- Real-time streaming via Watch and StreamEvents
- TLS support via `TLSConfig`
