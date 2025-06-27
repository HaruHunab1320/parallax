use parallax_sdk::{Client, ExecuteOptions, AgentSelector, SelectionStrategy};
use serde_json::json;
use tracing::info;
use tracing_subscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    // Create client
    let client = Client::connect("http://localhost:8080").await?;
    info!("Connected to Parallax control plane");

    // Example 1: List available patterns
    println!("\n=== Available Patterns ===");
    let patterns = client.patterns().list().await?;
    for pattern in patterns {
        println!("- {}: {}", pattern.name, pattern.description);
        println!("  Required capabilities: {:?}", pattern.required_capabilities);
        println!("  Enabled: {}\n", pattern.enabled);
    }

    // Example 2: List agents
    println!("\n=== Registered Agents ===");
    let agents = client.agents().list().await?;
    for agent in agents {
        println!("- {} ({})", agent.name, agent.id);
        println!("  Status: {:?}", agent.status);
        println!("  Capabilities: {:?}", agent.capabilities);
        println!("  Confidence: {:.2}", agent.confidence);
        println!("  Last seen: {}\n", agent.last_seen.format("%Y-%m-%d %H:%M:%S"));
    }

    // Example 3: Execute a pattern
    println!("\n=== Executing Pattern ===");
    let input = json!({
        "task": "Analyze the sentiment of customer feedback",
        "data": [
            "The product is amazing!",
            "Could be better",
            "Excellent service"
        ]
    });

    let options = ExecuteOptions {
        timeout_ms: Some(30000),
        agent_selector: Some(AgentSelector {
            capabilities: Some(vec!["analysis".to_string()]),
            min_count: Some(2),
            strategy: Some(SelectionStrategy::BestFit),
            ..Default::default()
        }),
        metadata: [(
            "source".to_string(), 
            json!("example")
        )].into_iter().collect(),
        ..Default::default()
    };

    let execution = client.patterns()
        .execute("consensus-builder", input, Some(options))
        .await?;

    println!("Execution ID: {}", execution.id);
    println!("Pattern: {}", execution.pattern);
    println!("Status: {:?}", execution.status);
    println!("Agents: {:?}", execution.agents);

    if let Some(output) = execution.output {
        println!("Output: {}", serde_json::to_string_pretty(&output)?);
    }
    if let Some(confidence) = execution.confidence {
        println!("Confidence: {:.2}", confidence);
    }
    if let Some(duration) = execution.duration_ms {
        println!("Duration: {}ms", duration);
    }

    // Example 4: Get execution status
    println!("\n=== Checking Execution Status ===");
    let status = client.patterns()
        .get_execution(&execution.id)
        .await?;
    println!("Status: {:?}", status.status);

    // Example 5: List recent executions
    println!("\n=== Recent Executions ===");
    let recent = client.patterns()
        .list_executions(5)
        .await?;
    
    for exec in recent {
        println!("- {} ({}): {:?}", 
            exec.pattern, 
            exec.id, 
            exec.status
        );
    }

    // Example 6: Stream agent updates
    println!("\n=== Streaming Agent Updates ===");
    use futures::StreamExt;
    
    let mut stream = client.agents().stream_agents().await?;
    let mut count = 0;
    
    println!("Listening for agent updates (showing first 5)...");
    while let Some(result) = stream.next().await {
        match result {
            Ok(agent) => {
                println!("Agent update: {} ({}) - Status: {:?}, Confidence: {:.2}",
                    agent.name, agent.id, agent.status, agent.confidence);
                count += 1;
                if count >= 5 {
                    break;
                }
            }
            Err(e) => {
                eprintln!("Stream error: {}", e);
                break;
            }
        }
    }

    Ok(())
}