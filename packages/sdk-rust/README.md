# Parallax Rust SDK

Official Rust SDK for the Parallax AI Coordination Platform.

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

## Examples

See the [examples](examples/) directory:

- [Basic Usage](examples/basic.rs) - Simple client usage
- [Agent Implementation](examples/agent.rs) - Implementing an agent

Run examples:

```bash
# Basic example
cargo run --example basic

# Agent example
cargo run --example agent
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