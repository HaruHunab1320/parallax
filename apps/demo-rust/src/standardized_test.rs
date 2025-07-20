use anyhow::{anyhow, Result};
use async_trait::async_trait;
use parallax_sdk::{
    agent::{Agent, AgentInfo, AgentResponse},
    client::{Client, ClientConfig},
};
use serde_json::json;
use std::collections::HashMap;

/// Test agent implementation
struct TestAgent {
    info: AgentInfo,
}

impl TestAgent {
    fn new() -> Self {
        Self {
            info: AgentInfo {
                id: "test-agent-rust".to_string(),
                name: "Test Agent (Rust)".to_string(),
                capabilities: vec!["analysis".to_string(), "validation".to_string()],
                expertise: 0.85,
                metadata: HashMap::new(),
            },
        }
    }
}

#[async_trait]
impl Agent for TestAgent {
    fn info(&self) -> &AgentInfo {
        &self.info
    }

    async fn analyze(&self, task: &str, input: serde_json::Value) -> Result<AgentResponse> {
        match task {
            "analyze" => {
                let data = input["data"].as_object().ok_or(anyhow!("Missing data"))?;
                let content_type = data.get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let content = data.get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                Ok(AgentResponse {
                    value: json!({
                        "summary": format!("Analyzed {} content", content_type),
                        "length": content.len(),
                        "result": "Analysis complete"
                    }),
                    confidence: 0.85,
                    reasoning: Some("Standard analysis performed".to_string()),
                    metadata: HashMap::new(),
                })
            }

            "validate" => {
                let data = input["data"].as_object().ok_or(anyhow!("Missing data"))?;
                let value = data.get("value")
                    .and_then(|v| v.as_i64())
                    .ok_or(anyhow!("Missing value"))?;
                let rules = data.get("rules")
                    .and_then(|v| v.as_array())
                    .ok_or(anyhow!("Missing rules"))?;

                let mut details = Vec::new();
                let mut valid = true;

                for rule in rules {
                    if let Some(rule_str) = rule.as_str() {
                        match rule_str {
                            "positive" => {
                                if value > 0 {
                                    details.push("Value is positive");
                                } else {
                                    valid = false;
                                    details.push("Value is not positive");
                                }
                            }
                            "even" => {
                                if value % 2 == 0 {
                                    details.push("Value is even");
                                } else {
                                    valid = false;
                                    details.push("Value is not even");
                                }
                            }
                            _ => {}
                        }
                    }
                }

                Ok(AgentResponse {
                    value: json!({
                        "valid": valid,
                        "details": details
                    }),
                    confidence: 0.95,
                    reasoning: Some("Validation rules applied".to_string()),
                    metadata: HashMap::new(),
                })
            }

            _ => Err(anyhow!("Unknown task: {}", task))
        }
    }
}

async fn run_standardized_tests() -> Result<bool> {
    println!("=== Parallax SDK Test Results ===");
    println!("Language: Rust");
    println!("SDK Version: 0.1.0\n");

    let mut results = HashMap::new();

    // Test 1: Agent Creation
    let test1_result = (|| -> Result<bool> {
        let agent = TestAgent::new();
        Ok(agent.info.id == "test-agent-rust" &&
           agent.info.capabilities.contains(&"analysis".to_string()) &&
           agent.info.capabilities.contains(&"validation".to_string()))
    })();
    
    match test1_result {
        Ok(passed) => {
            results.insert("Agent Creation", passed);
            println!("Test 1: Agent Creation............... {}", if passed { "PASS" } else { "FAIL" });
        }
        Err(e) => {
            results.insert("Agent Creation", false);
            println!("Test 1: Agent Creation............... FAIL ({})", e);
        }
    }

    // Test 2: Simple Analysis
    let test2_result = (|| async {
        let agent = TestAgent::new();
        let response = agent.analyze("analyze", json!({
            "data": {
                "content": "Test data for analysis",
                "type": "text"
            }
        })).await?;
        Ok(response.confidence >= 0.7 && !response.value.is_null())
    })().await;

    match test2_result {
        Ok(passed) => {
            results.insert("Simple Analysis", passed);
            println!("Test 2: Simple Analysis.............. {}", if passed { "PASS" } else { "FAIL" });
        }
        Err(e) => {
            results.insert("Simple Analysis", false);
            println!("Test 2: Simple Analysis.............. FAIL ({})", e);
        }
    }

    // Test 3: Validation
    let test3_result = (|| async {
        let agent = TestAgent::new();
        let response = agent.analyze("validate", json!({
            "data": {
                "value": 42,
                "rules": ["positive", "even"]
            }
        })).await?;
        
        let valid = response.value["valid"].as_bool().unwrap_or(false);
        let details = response.value["details"].as_array().map(|a| a.len()).unwrap_or(0);
        
        Ok(valid && response.confidence == 0.95 && details == 2)
    })().await;

    match test3_result {
        Ok(passed) => {
            results.insert("Validation", passed);
            println!("Test 3: Validation................... {}", if passed { "PASS" } else { "FAIL" });
        }
        Err(e) => {
            results.insert("Validation", false);
            println!("Test 3: Validation................... FAIL ({})", e);
        }
    }

    // Test 4: Error Handling
    let test4_result = (|| async {
        let agent = TestAgent::new();
        match agent.analyze("unknown-task", json!({})).await {
            Err(e) => Ok(e.to_string().to_lowercase().contains("unknown task")),
            Ok(_) => Ok(false),
        }
    })().await;

    match test4_result {
        Ok(passed) => {
            results.insert("Error Handling", passed);
            if !passed {
                println!("Test 4: Error Handling............... FAIL (No error thrown)");
            } else {
                println!("Test 4: Error Handling............... PASS");
            }
        }
        Err(e) => {
            results.insert("Error Handling", false);
            println!("Test 4: Error Handling............... FAIL ({})", e);
        }
    }

    // Test 5: Client API (optional)
    let test5_result = (|| async {
        let config = ClientConfig {
            base_url: "http://localhost:8080".to_string(),
            ..Default::default()
        };
        let client = Client::new(config)?;

        // 5.1 Health Check
        let health = client.health().await?;

        // 5.2 List Patterns
        let patterns = client.list_patterns().await?;

        // 5.3 Pattern Execution
        let execution = client.execute_pattern("SimpleConsensus", json!({
            "task": "SDK test",
            "data": {"test": true}
        })).await?;

        Ok(health.status == "healthy" && !patterns.is_empty() && !execution.id.is_empty())
    })().await;

    match test5_result {
        Ok(passed) => {
            results.insert("Client API", passed);
            println!("Test 5: Client API (optional)........ {}", if passed { "PASS" } else { "FAIL" });
        }
        Err(_) => {
            println!("Test 5: Client API (optional)........ SKIP (Control plane not running)");
        }
    }

    // Summary
    let passed = results.values().filter(|&&v| v).count();
    let total = results.len();
    println!("\nSummary: {}/{} tests passed", passed, total);

    Ok(passed == total)
}

#[tokio::main]
async fn main() {
    match run_standardized_tests().await {
        Ok(success) => {
            if !success {
                std::process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("Test suite failed: {}", e);
            std::process::exit(1);
        }
    }
}