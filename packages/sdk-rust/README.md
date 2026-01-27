# Parallax Rust SDK

Official Rust SDK for the Parallax AI Orchestration Platform.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
parallax-sdk = "0.1.0"
```

## Quick Start

```rust
use parallax_sdk::{Client, ExecuteOptions};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client
    let client = Client::connect("http://localhost:8080").await?;

    // List patterns
    let patterns = client.patterns().list().await?;
    for pattern in patterns {
        println!("{}: {}", pattern.name, pattern.description);
    }

    // Execute a pattern
    let execution = client.patterns()
        .execute(
            "consensus-builder",
            json!({
                "task": "Analyze sentiment",
                "data": ["Great product!", "Could be better"]
            }),
            None
        )
        .await?;

    println!("Execution: {:?}", execution);
    Ok(())
}
```

## Features

- Async/await API using Tokio
- Full control plane API support
- Pattern execution and monitoring
- Agent registration and management
- Real-time streaming updates
- Automatic retries and error handling
- TLS support
- Comprehensive error types

## Client Configuration

```rust
use parallax_sdk::{Client, ClientConfig, TlsConfig};
use std::time::Duration;

let config = ClientConfig {
    endpoint: "https://parallax.example.com:8080".to_string(),
    timeout: Duration::from_secs(30),
    connect_timeout: Duration::from_secs(10),
    keep_alive_interval: Duration::from_secs(30),
    keep_alive_timeout: Duration::from_secs(10),
    tls_config: Some(TlsConfig {
        ca_cert: include_bytes!("ca.pem").to_vec(),
        client_cert: Some(include_bytes!("client.pem").to_vec()),
        client_key: Some(include_bytes!("client-key.pem").to_vec()),
        domain_name: Some("parallax.example.com".to_string()),
    }),
};

let client = Client::new(config).await?;
```

## Pattern Operations

### List Patterns

```rust
let patterns = client.patterns().list().await?;
for pattern in patterns {
    println!("Pattern: {}", pattern.name);
    println!("  Description: {}", pattern.description);
    println!("  Required capabilities: {:?}", pattern.required_capabilities);
    println!("  Enabled: {}", pattern.enabled);
}
```

### Execute Pattern

```rust
use parallax_sdk::{ExecuteOptions, AgentSelector, SelectionStrategy};

let options = ExecuteOptions {
    async_execution: Some(false),
    priority: Some(1),
    timeout_ms: Some(30000),
    agent_selector: Some(AgentSelector {
        capabilities: Some(vec!["processing".to_string()]),
        min_count: Some(2),
        max_count: Some(5),
        strategy: Some(SelectionStrategy::BestFit),
        ..Default::default()
    }),
    metadata: [("request_id".to_string(), json!("req-123"))]
        .into_iter()
        .collect(),
    ..Default::default()
};

let execution = client.patterns()
    .execute(
        "map-reduce",
        json!({
            "data": [1, 2, 3, 4, 5],
            "operation": "sum"
        }),
        Some(options)
    )
    .await?;

println!("Execution ID: {}", execution.id);
println!("Status: {:?}", execution.status);
```

### Monitor Execution

```rust
// Get execution status
let status = client.patterns()
    .get_execution(&execution_id)
    .await?;

// Stream execution updates
use futures::StreamExt;

let mut stream = client.patterns()
    .stream_executions()
    .await?;

while let Some(result) = stream.next().await {
    match result {
        Ok(execution) => {
            println!("Update: {} - {:?}", execution.id, execution.status);
        }
        Err(e) => {
            eprintln!("Stream error: {}", e);
        }
    }
}
```

## Agent Operations

### Register Agent

```rust
use parallax_sdk::Agent;

let agent = Agent::new("My Rust Agent", vec![
    "nlp".to_string(),
    "sentiment".to_string(),
])
.with_endpoint("localhost:50051")
.with_metadata("version", "1.0.0")
.with_metadata("region", "us-east-1");

let registered = client.agents().register(agent).await?;
println!("Agent registered with ID: {}", registered.id);
```

### List Agents

```rust
let agents = client.agents().list().await?;
for agent in agents {
    println!("{} ({}): {:?}", agent.name, agent.id, agent.status);
    println!("  Confidence: {:.2}", agent.confidence);
    println!("  Capabilities: {:?}", agent.capabilities);
}
```

### Update Agent

```rust
use parallax_sdk::AgentStatus;

// Update status
client.agents()
    .update_status(&agent_id, AgentStatus::Active)
    .await?;

// Update confidence
client.agents()
    .update_confidence(&agent_id, 0.95)
    .await?;

// Send heartbeat
client.agents()
    .heartbeat(&agent_id)
    .await?;
```

### Stream Agent Updates

```rust
let mut stream = client.agents().stream_agents().await?;

while let Some(result) = stream.next().await {
    match result {
        Ok(agent) => {
            println!("Agent update: {} - {:?}", agent.id, agent.status);
        }
        Err(e) => {
            eprintln!("Stream error: {}", e);
        }
    }
}
```

## Error Handling

```rust
use parallax_sdk::Error;

match client.patterns().execute(pattern, input, None).await {
    Ok(execution) => {
        println!("Success: {}", execution.id);
    }
    Err(Error::NotFound(msg)) => {
        eprintln!("Pattern not found: {}", msg);
    }
    Err(Error::Timeout(msg)) => {
        eprintln!("Request timeout: {}", msg);
    }
    Err(Error::Connection(msg)) => {
        eprintln!("Connection error: {}", msg);
    }
    Err(e) => {
        eprintln!("Error: {}", e);
    }
}
```

## Confidence Extraction

The SDK provides automatic confidence extraction utilities:

```rust
use parallax_sdk::{
    ParallaxAgent, AgentResult, 
    with_confidence, ConfidenceConfig, ExtractionStrategy
};
use serde_json::{Value, json};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let agent = Arc::new(
        ParallaxAgent::new("my-agent", "My Agent", vec!["analysis".to_string()], Default::default())
    );
    
    // Configure confidence extraction
    let config = ConfidenceConfig {
        default_confidence: 0.7,
        strategy: ExtractionStrategy::Hybrid,
    };
    
    // Wrap your analysis function with confidence extraction
    let analyze_with_confidence = with_confidence(
        |task: &str, data: Option<Value>| async move {
            // Your analysis logic - just return the result
            Ok(json!({
                "answer": "The sentiment is positive",
                "details": "Based on keyword analysis..."
            }))
        },
        Some(config),
    );
    
    // Set the wrapped function
    let agent = agent.set_analyze_fn(analyze_with_confidence);
    
    // Serve the agent
    parallax_sdk::serve_agent(Arc::new(agent), 50051).await?;
    Ok(())
}
```

### Confidence Aggregation

```rust
use parallax_sdk::ConfidenceAggregator;

// Aggregate confidence from multiple sources
let confidences = vec![0.8, 0.85, 0.75, 0.9];

// Different aggregation strategies
let min_conf = ConfidenceAggregator::combine(&confidences, "min", None); // 0.75
let max_conf = ConfidenceAggregator::combine(&confidences, "max", None); // 0.9
let avg_conf = ConfidenceAggregator::combine(&confidences, "avg", None); // 0.825
let consensus = ConfidenceAggregator::combine(&confidences, "consensus", None); // Higher when values agree

// Calculate confidence from result consistency
let results = vec![
    json!({"answer": "positive"}),
    json!({"answer": "positive"}),
    json!({"answer": "neutral"}),
];
let consistency = ConfidenceAggregator::from_consistency(&results); // ~0.8 (2 out of 3 agree)
```

### Require Minimum Confidence

```rust
use parallax_sdk::{require_confidence, AgentResult};

// Use the macro to enforce minimum confidence
let analyze_with_threshold = require_confidence!(0.8, |task: &str, data: Option<Value>| async move {
    // Your analysis that returns AgentResult
    Ok(AgentResult {
        value: json!("Analysis result"),
        confidence: 0.75, // This will fail the threshold
        reasoning: None,
        uncertainties: vec![],
        metadata: Default::default(),
    })
});

// This will return an error because confidence is below 0.8
match analyze_with_threshold("analyze", None).await {
    Ok(result) => println!("Success: {:?}", result),
    Err(e) => println!("Failed threshold: {}", e),
}
```

## Examples

See the [examples](examples/) directory:

- [Basic Usage](examples/basic.rs) - Simple client usage
- [Agent Implementation](examples/agent.rs) - Implementing an agent
- [Confidence Extraction](examples/confidence.rs) - Using confidence utilities

Run examples:

```bash
# Basic example
cargo run --example basic

# Agent example
cargo run --example agent

# Confidence example
cargo run --example confidence
```

## Features

### TLS Support

Enable TLS with either rustls (default) or OpenSSL:

```toml
# Rustls (default)
parallax-sdk = "0.1.0"

# OpenSSL
parallax-sdk = { version = "0.1.0", default-features = false, features = ["openssl"] }
```

## Development

### Running Tests

```bash
cargo test
```

### Building

```bash
cargo build --release
```

### Documentation

```bash
cargo doc --open
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.