# Parallax Go SDK

Official Go SDK for the Parallax AI Coordination Platform.

## Installation

```bash
go get github.com/parallax/sdk-go
```

## Quick Start

```go
package main

import (
    "context"
    "log"
    "github.com/parallax/sdk-go/pkg/parallax"
)

func main() {
    // Create client
    client, err := parallax.NewClient(parallax.ClientConfig{
        Endpoint: "localhost:8080",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    ctx := context.Background()

    // List patterns
    patterns, err := client.Patterns().List(ctx)
    if err != nil {
        log.Fatal(err)
    }

    // Execute a pattern
    execution, err := client.Patterns().Execute(ctx, "consensus-builder", 
        map[string]interface{}{
            "task": "Analyze sentiment",
        },
        nil,
    )
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("Execution: %+v\n", execution)
}
```

## Features

- Full control plane API support
- Pattern execution and monitoring
- Agent registration and management
- Real-time streaming updates
- Automatic retries and error handling
- Context-aware operations
- Structured logging with zap

## Client Configuration

```go
client, err := parallax.NewClient(parallax.ClientConfig{
    Endpoint:       "localhost:8080",
    Logger:         zap.NewExample(),
    MaxRetries:     3,
    RequestTimeout: 30 * time.Second,
    KeepAlive:      30 * time.Second,
    ConnectTimeout: 10 * time.Second,
    TLSConfig: &parallax.TLSConfig{
        CertFile:   "/path/to/cert.pem",
        KeyFile:    "/path/to/key.pem",
        CAFile:     "/path/to/ca.pem",
        ServerName: "parallax.example.com",
    },
})
```

## Pattern Operations

### List Patterns

```go
patterns, err := client.Patterns().List(ctx)
for _, pattern := range patterns {
    fmt.Printf("%s: %s\n", pattern.Name, pattern.Description)
}
```

### Execute Pattern

```go
execution, err := client.Patterns().Execute(ctx, "map-reduce",
    map[string]interface{}{
        "data": []int{1, 2, 3, 4, 5},
        "operation": "sum",
    },
    &parallax.ExecuteOptions{
        Async:    false,
        Priority: 1,
        Timeout:  30 * time.Second,
        AgentSelector: parallax.AgentSelector{
            Capabilities: []string{"processing"},
            MinCount:     2,
            Strategy:     parallax.SelectionStrategyBestFit,
        },
        Metadata: map[string]interface{}{
            "requestId": "req-123",
        },
    },
)
```

### Monitor Execution

```go
// Get execution status
execution, err := client.Patterns().GetExecution(ctx, executionID)

// Stream execution updates
stream, err := client.Patterns().StreamExecutions(ctx)
for execution := range stream {
    fmt.Printf("Update: %s - %s\n", execution.ID, execution.Status)
}
```

## Agent Operations

### Register Agent

```go
agent := &parallax.Agent{
    Name:         "My Agent",
    Capabilities: []string{"nlp", "sentiment"},
    Endpoint:     "localhost:50051",
    Metadata: map[string]string{
        "version": "1.0.0",
        "region":  "us-east-1",
    },
}

err := client.Agents().Register(ctx, agent)
```

### List Agents

```go
agents, err := client.Agents().List(ctx)
for _, agent := range agents {
    fmt.Printf("%s: %s (confidence: %.2f)\n", 
        agent.Name, agent.Status, agent.Confidence)
}
```

### Update Agent

```go
// Update status
err := client.Agents().UpdateStatus(ctx, agentID, parallax.AgentStatusActive)

// Update confidence
err := client.Agents().UpdateConfidence(ctx, agentID, 0.95)

// Send heartbeat
err := client.Agents().Heartbeat(ctx, agentID)
```

### Stream Agent Updates

```go
stream, err := client.Agents().StreamAgents(ctx)
for agent := range stream {
    fmt.Printf("Agent update: %s - %s\n", agent.ID, agent.Status)
}
```

## Error Handling

```go
execution, err := client.Patterns().Execute(ctx, "pattern", input, nil)
if err != nil {
    // Handle different error types
    switch {
    case errors.Is(err, context.DeadlineExceeded):
        log.Error("Request timeout")
    case errors.Is(err, context.Canceled):
        log.Error("Request canceled")
    default:
        log.Error("Request failed:", err)
    }
}
```

## Context Usage

All operations support context for cancellation and timeouts:

```go
// With timeout
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

execution, err := client.Patterns().Execute(ctx, "pattern", input, nil)

// With cancellation
ctx, cancel := context.WithCancel(context.Background())
go func() {
    // Cancel after some condition
    time.Sleep(10 * time.Second)
    cancel()
}()

stream, err := client.Patterns().StreamExecutions(ctx)
```

## Examples

See the [examples](examples/) directory for complete examples:

- [Basic Usage](examples/basic/main.go) - Simple client usage
- [Agent Implementation](examples/agent/main.go) - Implementing an agent

## Development

### Running Tests

```bash
go test ./...
```

### Building

```bash
go build ./...
```

### Generating Mocks

```bash
go generate ./...
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.