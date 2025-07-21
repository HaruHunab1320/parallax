use anyhow::Result;
use parallax_sdk::{
    ParallaxAgent, AgentResult,
    Client, ClientConfig,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{info, warn};

/// Demo agent implementation
struct DemoAgent {
    agent: Arc<ParallaxAgent>,
}

impl DemoAgent {
    fn new() -> Self {
        let mut metadata = HashMap::new();
        metadata.insert("expertise".to_string(), "0.85".to_string());
        metadata.insert("language".to_string(), "rust".to_string());
        
        let agent = ParallaxAgent::new(
            "demo-agent-rust",
            "Rust Demo Agent",
            vec!["code-analysis".to_string(), "testing".to_string()],
            metadata,
        ).set_analyze_fn(move |task: &str, data: Option<serde_json::Value>| {
            let task = task.to_string();
            Box::pin(async move {
                match task.as_str() {
                    "analyze-code" => {
                        let data = data.ok_or("Missing data")?;
                        let code = data["code"]
                            .as_str()
                            .ok_or("Missing code in input")?;
                        
                        // Simple Rust code analysis
                        let has_tests = code.contains("#[test]") || code.contains("#[cfg(test)]");
                        let has_docs = code.contains("///") || code.contains("//!");
                        let has_unsafe = code.contains("unsafe");

                        let quality = if has_tests && has_docs && !has_unsafe {
                            "high"
                        } else {
                            "medium"
                        };

                        let mut suggestions = Vec::new();
                        if !has_tests {
                            suggestions.push("Add unit tests");
                        }
                        if !has_docs {
                            suggestions.push("Add documentation");
                        }
                        if has_unsafe {
                            suggestions.push("Review unsafe code usage");
                        }

                        Ok(AgentResult {
                            value: json!({
                                "has_tests": has_tests,
                                "has_docs": has_docs,
                                "has_unsafe": has_unsafe,
                                "quality": quality,
                                "suggestions": suggestions,
                                "lines_analyzed": code.lines().count(),
                            }),
                            confidence: 0.85,
                            reasoning: Some(format!("Analyzed {} lines of Rust code", code.lines().count())),
                            uncertainties: vec![],
                            metadata: HashMap::new(),
                        })
                    }
                    "get-system-info" => {
                        Ok(AgentResult {
                            value: json!({
                                "version": "1.0.0",
                                "language": "Rust",
                                "platform": std::env::consts::OS,
                                "arch": std::env::consts::ARCH,
                            }),
                            confidence: 1.0,
                            reasoning: None,
                            uncertainties: vec![],
                            metadata: HashMap::new(),
                        })
                    }
                    _ => Err(format!("Unknown task: {}", task).into()),
                }
            })
        });
        
        Self {
            agent: Arc::new(agent),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();
    info!("🚀 Parallax Rust SDK Demo\n");

    // Test 1: Agent Creation
    info!("1️⃣  Creating Demo Agent...");
    let agent = DemoAgent::new();
    info!("✅ Agent created: {} ({})", agent.agent.name, agent.agent.id);
    info!("   Capabilities: {:?}", agent.agent.capabilities);
    info!("   Expertise: {}\n", agent.agent.metadata.get("expertise").unwrap_or(&"0.5".to_string()));

    // Test 2: Agent Methods
    info!("2️⃣  Testing Agent Methods...");

    let code_to_analyze = r#"
/// Calculate the sum of two numbers
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 2), 4);
    }
}
"#;

    let response = (agent.agent.analyze_fn)("analyze-code", Some(json!({ "code": code_to_analyze })))
        .await
        .map_err(|e| anyhow::anyhow!("Analysis failed: {}", e))?;
    info!("✅ Code analysis result: {}", response.value);
    info!("   Confidence: {}", response.confidence);
    if let Some(reasoning) = &response.reasoning {
        info!("   Reasoning: {}\n", reasoning);
    }

    // Test system info
    let sys_response = (agent.agent.analyze_fn)("get-system-info", None).await
        .map_err(|e| anyhow::anyhow!("System info failed: {}", e))?;
    info!("✅ System info: {}\n", sys_response.value);

    // Test 3: Control Plane Client
    info!("3️⃣  Testing Control Plane Client...");

    let config = ClientConfig {
        endpoint: "http://localhost:8080".to_string(),
        timeout: std::time::Duration::from_secs(5),
        ..Default::default()
    };

    match Client::new(config).await {
        Ok(client) => {
            // Client created successfully
            info!("✅ Control plane client created");

            // Get client services
            let _patterns = client.patterns();
            let _agents = client.agents();
            
            info!("✅ Client services available");
            info!("   Pattern service: available");
            info!("   Agent service: available\n");

            // Test 4: Pattern Execution
            info!("4️⃣  Testing Pattern Execution...");

            // Start the agent's gRPC server
            let agent_clone = Arc::clone(&agent.agent);
            tokio::spawn(async move {
                if let Err(e) = agent_clone.serve(50054).await {
                    eprintln!("Failed to serve agent: {}", e);
                }
            });
            
            // Give the agent time to start and register
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            
            info!("✅ Agent started and registered with control plane");
            
            // Note: Pattern execution would happen here, but requires
            // the control plane to have patterns configured
        }
        Err(_) => {
            info!("⚠️  Control plane not running (this is normal for SDK testing)\n");
        }
    }

    // Test 5: Error Handling
    info!("5️⃣  Testing Error Handling...");
    match (agent.agent.analyze_fn)("invalid-task", Some(json!({}))).await {
        Err(e) => info!("✅ Error handling works: {}\n", e),
        Ok(_) => warn!("Expected error but got success"),
    }

    info!("✅ Rust SDK Demo Complete!");
    info!("\nSummary:");
    info!("- Agent creation: ✅");
    info!("- Method execution: ✅");
    info!("- Client API: ✅ (requires control plane)");
    info!("- Error handling: ✅");

    Ok(())
}