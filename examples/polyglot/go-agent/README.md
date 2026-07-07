# Go agent example

A complete, self-contained Go agent for parallax. **This is example code,
not a maintained SDK** — copy it into your project and adapt it. The wire
contract it implements is defined by [`/proto`](../../../proto); see
[`docs/any-language.md`](../../../docs/any-language.md).

## Layout

- `generated/` — protobuf/gRPC stubs generated from `/proto`
  (regenerate with `./generate-proto.sh`)
- `pkg/parallax/` — agent scaffolding: registration + lease renewal,
  direct-serve mode, gateway mode (outbound stream, works behind NAT),
  confidence helpers
- `cmd/demo/` — a runnable agent using the scaffolding

## Run

```bash
# control plane must be running (see repo root: pnpm start)
PARALLAX_REGISTRY=localhost:50051 go run ./cmd/demo
```

The demo registers as `test-agent-go` with `analysis` and `validation`
capabilities and answers tasks with a `{ value, confidence, reasoning }`
result. Include it in any pattern that matches those capabilities.

## Gateway mode (remote / behind NAT)

```go
agent := parallax.NewParallaxAgent("my-agent", "My Agent",
    []string{"analysis"}, nil)
agent.AnalyzeFunc = myAnalyze
err := agent.ConnectViaGateway(ctx, "control-plane-host:8081", nil)
```

No inbound port needed — the agent dials out and receives tasks over the
stream, with heartbeats and auto-reconnect handled by the scaffolding.
