# Session Resume: Remaining Work (Parallax)

Use this as the handoff checklist for the next session after permissions are restored.

## 1) Regenerate Protobuf SDKs (Required)
New gRPC service `ExecutionService` was added in `proto/executions.proto`. SDKs need regenerated code.

### Go
```bash
cd packages/sdk-go
./generate-proto.sh
```
Notes:
- Requires `protoc-gen-go` and `protoc-gen-go-grpc`.
- Script installs them if missing (network access required).

### TypeScript
```bash
cd packages/sdk-typescript
./generate-proto.sh
```
Notes:
- Uses `ts-proto` plugin from `node_modules`.
- Ensure deps are installed (`pnpm install`) if missing.

### Rust
```bash
cd packages/sdk-rust
./generate-proto.sh
```
Notes:
- Uses `build.rs` to generate into `packages/sdk-rust/generated`.

## 2) Verify SDK Compile Status (Required)
After regeneration, run builds/tests if available:
```bash
pnpm --filter @parallax/sdk-typescript build
```
```bash
cd packages/sdk-go
go test ./...
```
```bash
cd packages/sdk-rust
cargo test
```

## 3) Optional: Runtime Streaming Enhancements
Current gRPC streaming for executions is poll-based (start/completed events).
If richer streaming is desired:
- Emit progress events from runtime execution (pattern engine or runtime manager).
- Update `ExecutionServiceImpl.streamExecution` to push progress/agent events instead of polling.
Files:
- `packages/control-plane/src/grpc/services/execution-service.ts`
- `packages/control-plane/src/pattern-engine/pattern-engine.ts`
- `packages/control-plane/src/runtime-manager/runtime-manager.ts`

## 4) Doc Cleanup / Archiving (Required)
Filesystem did not allow deletion/moves in the previous session. After permissions:
- Remove or move these stale docs into `docs/archive/`:
  - `docs/archive/PATTERN_GENERATION_ARCHITECTURE_GAP.md` (archived).
  - If desired: move or remove any other stale docs listed in `docs/REPO_AUDIT.md`.
- Ensure `docs/DOC_README.md` and `docs/archive/README.md` list the final state.

## 5) Golden Ticket Demo Prep (Next Phase)
Once SDK regen + doc cleanup are done, move to demo readiness:
1. **Agent wiring (Gemini 3)**: build real agent implementations with Gemini toolchain.
2. **Patterns for swarm demo**: planner, task sharding, review/merge, testing loop.
3. **Scenario compile + run**: ensure CLI flow compiles YAML → Prism → run.
4. **Demo harness**: one command to spin agents and execute the orchestration.

Key paths:
- CLI scenario: `packages/cli/src/commands/scenario.ts`
- Pattern engine/runtime: `packages/control-plane/src/pattern-engine/*`
- LLM provider: `packages/pattern-sdk/src/llm/providers/gemini.ts`

## 6) Quick File Index (Changes Already Made)
- gRPC execution API: `proto/executions.proto`
- Control plane gRPC: `packages/control-plane/src/grpc/services/execution-service.ts`
- gRPC server registration: `packages/control-plane/src/grpc/grpc-server.ts`
- Pattern engine input tracking/listing: `packages/control-plane/src/pattern-engine/*`
- Go SDK execution service: `packages/sdk-go/pkg/parallax/execution_service.go`
- Rust SDK execution service: `packages/sdk-rust/src/executions.rs`
- Doc consolidation: `docs/PATTERN_SDK_ARCHITECTURE.md`, `docs/DOC_README.md`, `docs/archive/README.md`

## 7) Known Constraint From Previous Session
- Commands that install tooling (e.g., `protoc-gen-go`) failed due to network restrictions.
- Once permissions/network are available, regenerate protos first.
