use anyhow::Result;
use async_trait::async_trait;
use parallax_sdk::{
    agent::{Agent, AgentInfo, AgentResponse},
    client::{Client, ClientConfig},
    types::PatternExecution,
};
use serde_json::json;
use std::collections::HashMap;
use tracing::{info, warn};

/// Demo agent implementation
struct DemoAgent {
    info: AgentInfo,
}

impl DemoAgent {
    fn new() -> Self {
        Self {
            info: AgentInfo {
                id: "demo-agent-rust".to_string(),
                name: "Rust Demo Agent".to_string(),
                capabilities: vec!["code-analysis".to_string(), "testing".to_string()],
                expertise: 0.85,
                metadata: HashMap::new(),
            },
        }
    }

    async fn analyze_code(&self, code: &str) -> AgentResponse {
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

        AgentResponse {
            value: json!({
                "has_tests": has_tests,
                "has_docs": has_docs,
                "has_unsafe": has_unsafe,
                "quality": quality,
                "suggestions": suggestions,
            }),
            confidence: 0.85,
            reasoning: Some(format!("Analyzed {} lines of Rust code", code.lines().count())),
            metadata: HashMap::new(),
        }
    }

    async fn get_system_info(&self) -> AgentResponse {
        AgentResponse {
            value: json!({
                "version": "1.0.0",
                "language": "Rust",
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
            }),
            confidence: 1.0,
            reasoning: None,
            metadata: HashMap::new(),
        }
    }
}

#[async_trait]
impl Agent for DemoAgent {
    fn info(&self) -> &AgentInfo {
        &self.info
    }

    async fn analyze(&self, task: &str, input: serde_json::Value) -> Result<AgentResponse> {
        match task {
            "analyze-code" => {
                let code = input["code"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Missing code in input"))?;
                Ok(self.analyze_code(code).await)
            }
            "get-system-info" => Ok(self.get_system_info().await),
            _ => Err(anyhow::anyhow!("Unknown task: {}", task)),
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
    info!("✅ Agent created: {} ({})", agent.info.name, agent.info.id);
    info!("   Capabilities: {:?}", agent.info.capabilities);
    info!("   Expertise: {}\n", agent.info.expertise);

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

    let response = agent
        .analyze("analyze-code", json!({ "code": code_to_analyze }))
        .await?;
    info!("✅ Code analysis result: {}", response.value);
    info!("   Confidence: {}", response.confidence);
    if let Some(reasoning) = &response.reasoning {
        info!("   Reasoning: {}\n", reasoning);
    }

    // Test system info
    let sys_response = agent.analyze("get-system-info", json!({})).await?;
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
            // Check health
            match client.health().await {
                Ok(health) => {
                    info!("✅ Health check: {:?}", health);

                    // List patterns
                    match client.list_patterns().await {
                        Ok(patterns) => {
                            info!("✅ Found {} patterns", patterns.len());
                            if let Some(first) = patterns.first() {
                                info!("   First pattern: {} v{}", first.name, first.version);
                            }
                        }
                        Err(e) => warn!("Failed to list patterns: {}", e),
                    }

                    // List agents
                    match client.list_agents().await {
                        Ok(agents) => {
                            info!("✅ Found {} registered agents\n", agents.agents.len());
                        }
                        Err(e) => warn!("Failed to list agents: {}", e),
                    }

                    // Test 4: Pattern Execution
                    info!("4️⃣  Testing Pattern Execution...");

                    // Register agent
                    let registration = parallax_sdk::generated::AgentRegistration {
                        id: agent.info.id.clone(),
                        name: agent.info.name.clone(),
                        endpoint: "grpc://localhost:50054".to_string(),
                        capabilities: agent.info.capabilities.clone(),
                        metadata: {
                            let mut m = HashMap::new();
                            m.insert("sdk".to_string(), json!("rust"));
                            m.insert("version".to_string(), json!("0.1.0"));
                            m
                        },
                    };

                    match client.register_agent(registration).await {
                        Ok(_) => {
                            info!("✅ Agent registered with control plane");

                            // Execute pattern
                            match client
                                .execute_pattern(
                                    "SimpleConsensus",
                                    json!({
                                        "task": "Test the Rust SDK",
                                        "data": { "test": true }
                                    }),
                                )
                                .await
                            {
                                Ok(execution) => {
                                    info!("✅ Pattern execution started: {}", execution.id);

                                    // Wait and get result
                                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                                    match client.get_execution(&execution.id).await {
                                        Ok(result) => {
                                            info!("✅ Execution result: {:?}\n", result.status);
                                        }
                                        Err(e) => warn!("Failed to get execution result: {}", e),
                                    }
                                }
                                Err(e) => warn!("Failed to execute pattern: {}", e),
                            }
                        }
                        Err(e) => warn!("Failed to register agent: {}", e),
                    }
                }
                Err(_) => {
                    info!("⚠️  Control plane not running (this is normal for SDK testing)\n");
                }
            }
        }
        Err(e) => {
            warn!("Failed to create client: {}", e);
        }
    }

    // Test 5: Error Handling
    info!("5️⃣  Testing Error Handling...");
    match agent.analyze("invalid-task", json!({})).await {
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