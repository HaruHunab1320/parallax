# Parallax Proto Definitions

This directory contains the Protocol Buffer (protobuf) definitions for the Parallax platform. These define the gRPC interfaces used for communication between agents and the control plane.

## Proto Files

- **confidence.proto** - Core agent service interface for confidence-aware analysis
- **coordinator.proto** - Multi-agent coordination patterns and strategies  
- **patterns.proto** - Pattern execution and management services
- **registry.proto** - Agent registration and discovery services
- **executions.proto** - Execution listing, detail, and streaming services

## Generating Language-Specific Code

Each SDK has a standardized `generate-proto.sh` script that generates language-specific code from these proto definitions. All SDKs follow the same conventions:

- Script name: `generate-proto.sh`
- Input directory: `../../proto/` (this directory)
- Output directory: `generated/`
- All proto files in this directory are generated

### TypeScript SDK
```bash
cd packages/sdk-typescript
./generate-proto.sh
```

### Python SDK
```bash
cd packages/sdk-python
./generate-proto.sh
```

### Go SDK
```bash
cd packages/sdk-go
./generate-proto.sh
```

### Rust SDK
```bash
cd packages/sdk-rust
./generate-proto.sh
# Or just build - Rust uses build.rs
cargo build
```

## Adding New Proto Files

When adding new proto files:
1. Add the `.proto` file to this directory
2. Update all SDK `generate-proto.sh` scripts to include the new file
3. For Rust, also update `build.rs`
4. Regenerate all SDKs to ensure consistency
