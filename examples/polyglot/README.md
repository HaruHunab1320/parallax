# Polyglot agents

Agents join a parallax swarm over gRPC — the wire contract is the `.proto`
files in [`/proto`](../../proto), nothing more. Any language with a gRPC
stack can participate. See [`docs/any-language.md`](../../docs/any-language.md)
for the contract walkthrough.

These directories are **self-contained examples, not maintained SDKs**. They
compile against the current protos and show the two connection modes:

| Example | Language | Shows |
|---------|----------|-------|
| [`go-agent/`](go-agent/) | Go | Direct serve + registry registration, gateway mode |
| [`rust-agent/`](rust-agent/) | Rust (tonic) | Direct serve, gateway mode with auto-reconnect |

Maintained SDKs exist for **TypeScript** (`packages/sdk-typescript`) and
**Python** (`packages/sdk-python`). For those languages, start from
[`examples/standalone-agent`](../standalone-agent) or
[`examples/python-agent`](../python-agent) instead.

## The contract in one paragraph

An agent either (a) runs its own gRPC server implementing `ConfidenceAgent`
and registers itself with the control plane's `Registry` service, or (b) —
for machines behind NAT, like a Raspberry Pi — opens an outbound
bidirectional stream to the `AgentGateway` service and receives tasks over
it. Either way, every task response carries `{ value, confidence (0.0–1.0),
reasoning }`. Confidence is what the platform routes, caches, and escalates
on — report it honestly.
