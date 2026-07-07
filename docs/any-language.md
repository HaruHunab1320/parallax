# Agents in any language

Parallax does not require an SDK. The contract between an agent and the
platform is gRPC, defined entirely by the files in [`/proto`](../proto).
Any language with a gRPC stack — Go, Rust, Java, C#, Elixir, anything —
can join a swarm. Working proof lives in
[`examples/polyglot/`](../examples/polyglot/): a Go agent and a Rust agent,
each self-contained.

Maintained SDKs exist for **TypeScript** (`packages/sdk-typescript`) and
**Python** (`packages/sdk-python`); use those if you can. This page is the
contract for everyone else.

## The one rule: report honest confidence

Every task response carries:

```json
{ "value": <any JSON>, "confidence": 0.0-1.0, "reasoning": "why" }
```

Confidence is not decoration — the platform uses it to select results
across parallel agents, stop early when a result is good enough, decide
what to cache, and escalate low-confidence work up the org chart. An agent
that always reports `1.0` breaks those decisions for the whole swarm.

## Mode 1 — Direct serve (agent hosts a gRPC server)

For agents on routable hosts (same cluster/network as the control plane):

1. Implement the `ConfidenceAgent` service (`proto/coordinator.proto`):
   respond to `Analyze(AgentRequest) → ConfidenceResult` and health checks.
2. Register with the control plane's `Registry` service
   (`proto/registry.proto`): call `Register` with your agent id, name,
   capabilities, and address; keep the lease alive with `Renew` on the
   returned lease id.

The control plane then dials your agent directly when a pattern needs your
capabilities.

## Mode 2 — Gateway (agent dials out; works behind NAT)

For agents on laptops, Raspberry Pis, or anywhere without an inbound route
(`proto/gateway.proto`):

1. Open the bidirectional stream `AgentGateway.Connect`.
2. Send `AgentHello` (id, name, capabilities, heartbeat interval); wait
   for `ServerAck`.
3. Loop: heartbeat on your stated interval; answer `TaskRequest` with
   `TaskResult` (or `TaskError`), correlating via `request_id`; respond to
   `Ping`.

No inbound port, no registration step — presence in the registry is implied
by the live stream. Reconnect with backoff when the stream drops.

The same stream also carries the thread-orchestration payloads
(`ThreadSpawnRequest` / `ThreadInputRequest` / `ThreadStopRequest`) used by
CLI runtime agents in coding swarms. A plain analyze-agent can ignore
these — see the examples for the minimal handling.

## Generating stubs

Point your language's protoc plugin at `/proto`:

```bash
# Go (see examples/polyglot/go-agent/generate-proto.sh)
protoc -I proto --go_out=. --go-grpc_out=. proto/*.proto

# Rust: tonic-build in build.rs (see examples/polyglot/rust-agent/build.rs)
```

Proto loading conventions used by the platform (for dynamic-loading
languages): `keepCase: true, longs: String, enums: String, defaults: true,
oneofs: true`.
