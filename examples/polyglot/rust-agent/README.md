# Rust agent example

A complete, self-contained Rust (tonic) agent for parallax. **This is
example code, not a maintained SDK** — copy it into your project and adapt
it. The wire contract it implements is defined by
[`/proto`](../../../proto); see
[`docs/any-language.md`](../../../docs/any-language.md).

## Layout

- `build.rs` — regenerates gRPC stubs from `/proto` into `generated/` on
  build (`build_transport(false)` because the gateway RPC is named
  `Connect`, which collides with tonic's generated transport constructor)
- `src/parallax_agent.rs` — agent scaffolding: registration + lease
  renewal, direct-serve mode, gateway mode with exponential-backoff
  reconnect
- `examples/` — runnable agents

## Run

```bash
# control plane must be running (see repo root: pnpm start)
PARALLAX_REGISTRY=http://localhost:50051 cargo run --example full_agent
```

Agents answer tasks with `{ value, confidence (0.0–1.0), reasoning }` —
confidence is what the platform routes, caches, and escalates on.

## Gateway mode (remote / behind NAT)

```rust
let agent = Arc::new(
    ParallaxAgent::new("my-agent", "My Agent", vec!["analysis".into()],
        HashMap::new())
    .set_analyze_fn(|task, data| async move { /* ... */ }),
);
agent.connect_via_gateway("http://control-plane-host:8081", None).await?;
```

No inbound port needed — the agent dials out and receives tasks over a
bidirectional stream.
