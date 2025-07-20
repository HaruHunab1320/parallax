# SDK Testing Guide

Before deploying Parallax to production, it's crucial to verify that all SDKs are working correctly. This guide walks you through testing each SDK.

## Overview

We have demo applications for each SDK that test:
- ✅ Agent creation and configuration
- ✅ Method execution and decorators/attributes
- ✅ Client API communication
- ✅ Pattern execution (requires control plane)
- ✅ Error handling

## Quick Test All SDKs

```bash
# Run all SDK tests at once
pnpm test:sdks

# Or
./test-all-sdks.sh
```

## Test Individual SDKs

### TypeScript SDK

```bash
# Using pnpm script
pnpm demo:typescript

# Or directly
cd apps/demo-typescript
pnpm install
pnpm dev
```

**What it tests:**
- TypeScript decorators (`@confidence`, `@withMetadata`, `@cached`)
- Agent class inheritance
- Promise-based API
- Type safety

### Python SDK

```bash
# Using pnpm script
pnpm demo:python

# Or directly
cd apps/demo-python
poetry install
poetry run python demo_agent.py
```

**What it tests:**
- Python decorators (`@capabilities`, `@confidence_threshold`, `@with_reasoning`)
- Async/await support
- Type hints
- Integration with ML libraries

### Go SDK

```bash
# Using pnpm script
pnpm demo:go

# Or directly
cd apps/demo-go
go mod tidy
go run main.go
```

**What it tests:**
- Interface implementation
- Context handling
- Concurrent operations
- Error handling patterns

### Rust SDK

```bash
# Using pnpm script
pnpm demo:rust

# Or directly
cd apps/demo-rust
cargo run
```

**What it tests:**
- Async trait implementation
- Type safety with serde
- Error handling with Result
- Memory safety

## Test Output Interpretation

Each SDK demo will show:

```
1️⃣  Creating Demo Agent...
   ✅ Agent created with ID and capabilities

2️⃣  Testing Agent Methods...
   ✅ Agent can analyze tasks and return responses

3️⃣  Testing Control Plane Client...
   ⚠️  May show warnings if control plane not running

4️⃣  Testing Pattern Execution...
   ⚠️  Requires control plane to be running

5️⃣  Testing Error Handling...
   ✅ Errors are handled gracefully
```

## Full Integration Test

To test SDKs with the control plane:

1. **Start the control plane:**
   ```bash
   pnpm run dev:control-plane
   ```

2. **Run SDK tests again:**
   ```bash
   pnpm test:sdks
   ```

Now you should see:
- ✅ Successful pattern listing
- ✅ Agent registration
- ✅ Pattern execution

## Common Issues and Solutions

### TypeScript: Module not found
```bash
# Rebuild the SDK
cd packages/sdk-typescript
pnpm build
```

### Python: Poetry not installed
```bash
# Install Poetry
curl -sSL https://install.python-poetry.org | python3 -
```

### Go: Module errors
```bash
# Update go.mod
cd apps/demo-go
go mod tidy
```

### Rust: Compilation errors
```bash
# Update dependencies
cd apps/demo-rust
cargo update
```

## SDK Feature Matrix

| Feature | TypeScript | Python | Go | Rust |
|---------|------------|--------|-----|------|
| Agent Base Class | ✅ | ✅ | ✅ | ✅ |
| Decorators/Attributes | ✅ | ✅ | ❌ | ❌ |
| Async Support | ✅ | ✅ | ✅ | ✅ |
| gRPC Server | ✅ | ✅ | ✅ | ✅ |
| Client API | ✅ | ✅ | ✅ | ✅ |
| Pattern Execution | ✅ | ✅ | ✅ | ✅ |
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Type Safety | ✅ | ✅ | ✅ | ✅ |
| Error Handling | ✅ | ✅ | ✅ | ✅ |
| Caching | ✅ | ✅ | 🚧 | 🚧 |
| Metadata | ✅ | ✅ | ✅ | ✅ |
| Health Checks | ✅ | ✅ | ✅ | ✅ |

Legend: ✅ Implemented, 🚧 Planned, ❌ Not applicable

## Production Readiness Checklist

Before deploying, ensure:

- [ ] All SDK tests pass
- [ ] Control plane integration works
- [ ] Error handling is robust
- [ ] Performance is acceptable
- [ ] Documentation is complete
- [ ] Examples are provided
- [ ] Version compatibility is verified

## Next Steps

1. **Fix any failing tests** - SDKs must work reliably
2. **Add more test cases** - Cover edge cases
3. **Performance testing** - Ensure SDKs can handle load
4. **Security review** - Check for vulnerabilities
5. **Documentation** - Ensure SDK docs are complete

Once all SDKs pass their tests, you're ready to deploy Parallax to production!