# Parallax Go SDK

Official Go SDK for the Parallax AI Orchestration Platform.

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

## Confidence Extraction

The SDK provides automatic confidence extraction utilities:

```go
package main

import (
    "context"
    "github.com/parallax/sdk-go/pkg/parallax"
)

// Create an agent with automatic confidence extraction
func main() {
    agent := parallax.NewParallaxAgent("my-agent", "My Agent", []string{"analysis"}, nil)
    
    // Create confidence extractor
    extractor := parallax.NewConfidenceExtractor(0.7, "hybrid")
    
    // Wrap your analysis function with confidence extraction
    agent.AnalyzeFunc = parallax.WithConfidence(
        func(ctx context.Context, task string, data interface{}) (interface{}, error) {
            // Your analysis logic - just return the result
            result := map[string]interface{}{
                "answer": "The sentiment is positive",
                "details": "Based on keyword analysis...",
            }
            return result, nil
        },
        extractor,
    )
    
    // Serve the agent
    if err := agent.Serve(50051); err != nil {
        log.Fatal(err)
    }
}
```

### Confidence Aggregation

```go
// Aggregate confidence from multiple sources
aggregator := &parallax.ConfidenceAggregator{}

confidences := []float64{0.8, 0.85, 0.75, 0.9}

// Different aggregation strategies
minConf := aggregator.Combine(confidences, "min", nil)        // 0.75
maxConf := aggregator.Combine(confidences, "max", nil)        // 0.9
avgConf := aggregator.Combine(confidences, "avg", nil)        // 0.825
consensusConf := aggregator.Combine(confidences, "consensus", nil) // Higher when values agree

// Calculate confidence from result consistency
results := []interface{}{
    map[string]string{"answer": "positive"},
    map[string]string{"answer": "positive"},
    map[string]string{"answer": "neutral"},
}
consistencyConf := aggregator.FromConsistency(results) // ~0.8 (2 out of 3 agree)
```

### Require Minimum Confidence

```go
// Wrap function to enforce minimum confidence
analyzeWithThreshold := parallax.RequireMinimumConfidence(0.8,
    func(ctx context.Context, task string, data interface{}) (*parallax.AgentResult, error) {
        // Your analysis that returns AgentResult
        return &parallax.AgentResult{
            Value: "Analysis result",
            Confidence: 0.75, // This will fail the threshold
        }, nil
    },
)

// This will return an error because confidence is below 0.8
result, err := analyzeWithThreshold(ctx, "analyze", data)
```

## Examples

See the [examples](examples/) directory for complete examples:

- [Basic Usage](examples/basic/main.go) - Simple client usage
- [Agent Implementation](examples/agent/main.go) - Implementing an agent
- [Confidence Extraction](examples/confidence/main.go) - Using confidence utilities

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