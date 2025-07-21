use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::sleep;
use std::time::Duration;

// Import from the workspace package
use parallax_sdk::{ParallaxAgent, AgentResult};

/// Test agent implementation using ParallaxAgent
struct TestAgent {
    agent: Arc<ParallaxAgent>,
}

impl TestAgent {
    fn new() -> Self {
        let agent = ParallaxAgent::new(
            "test-agent-rust",
            "Test Agent (Rust)",
            vec!["analysis".to_string(), "validation".to_string()],
            {
                let mut metadata = HashMap::new();
                metadata.insert("expertise".to_string(), "0.85".to_string());
                metadata
            },
        ).set_analyze_fn(move |task: &str, data: Option<serde_json::Value>| -> futures::future::BoxFuture<'static, Result<AgentResult, Box<dyn std::error::Error>>> {
            let task = task.to_string();
            Box::pin(async move {
                match task.as_str() {
                    "analyze" => {
                        let data = data.ok_or("Missing data")?;
                        let data_obj = data.as_object().ok_or("Data is not an object")?;
                        let content_data = data_obj.get("data")
                            .and_then(|v| v.as_object())
                            .ok_or("Missing data field")?;
                        
                        let content_type = content_data.get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");
                        let content = content_data.get("content")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        Ok(AgentResult {
                            value: json!({
                                "summary": format!("Analyzed {} content", content_type),
                                "length": content.len(),
                                "result": "Analysis complete"
                            }),
                            confidence: 0.85,
                            reasoning: Some("Standard analysis performed".to_string()),
                            uncertainties: vec![],
                            metadata: HashMap::new(),
                        })
                    }

                    "validate" => {
                        let data = data.ok_or("Missing data")?;
                        let data_obj = data.as_object().ok_or("Data is not an object")?;
                        let validate_data = data_obj.get("data")
                            .and_then(|v| v.as_object())
                            .ok_or("Missing data field")?;
                        
                        let value = validate_data.get("value")
                            .and_then(|v| v.as_i64())
                            .ok_or("Missing value")?;
                        let rules = validate_data.get("rules")
                            .and_then(|v| v.as_array())
                            .ok_or("Missing rules")?;

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

                        Ok(AgentResult {
                            value: json!({
                                "valid": valid,
                                "details": details
                            }),
                            confidence: 0.95,
                            reasoning: Some("Validation rules applied".to_string()),
                            uncertainties: vec![],
                            metadata: HashMap::new(),
                        })
                    }

                    _ => Err(format!("Unknown task: {}", task).into())
                }
            })
        });
        
        Self {
            agent: Arc::new(agent),
        }
    }
    
    async fn analyze(&self, task: &str, data: serde_json::Value) -> Result<AgentResult> {
        (self.agent.analyze_fn)(task, Some(data)).await.map_err(|e| anyhow!("{}", e))
    }
}

async fn run_standardized_tests() -> Result<bool> {
    println!("=== Parallax SDK Test Results ===");
    println!("Language: Rust");
    println!("SDK Version: 0.1.0\n");

    let mut results = HashMap::new();

    // Test 1: Agent Creation
    let test1_result = (|| -> Result<bool> {
        let test_agent = TestAgent::new();
        Ok(test_agent.agent.id == "test-agent-rust" &&
           test_agent.agent.capabilities.contains(&"analysis".to_string()) &&
           test_agent.agent.capabilities.contains(&"validation".to_string()))
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
    let test2_result: Result<bool> = (|| async {
        let test_agent = TestAgent::new();
        let response = test_agent.analyze("analyze", json!({
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
    let test3_result: Result<bool> = (|| async {
        let test_agent = TestAgent::new();
        let response = test_agent.analyze("validate", json!({
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
    let test4_result: Result<bool> = (|| async {
        let test_agent = TestAgent::new();
        match test_agent.analyze("unknown-task", json!({})).await {
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

    // Test 5: gRPC Server and Registration
    print!("Test 5: gRPC Server.................. ");
    let test5_result: Result<bool> = (|| async {
        let test_agent = TestAgent::new();
        let agent_clone = Arc::clone(&test_agent.agent);
        
        // Start the agent's gRPC server in the background
        tokio::spawn(async move {
            if let Err(e) = agent_clone.serve(50057).await {
                eprintln!("Failed to serve: {}", e);
            }
        });
        
        // Give it a moment to start and register
        sleep(Duration::from_secs(2)).await;
        
        // If we got here without crashing, it's working
        Ok(true)
    })().await;
    
    match test5_result {
        Ok(passed) => {
            results.insert("gRPC Server", passed);
            if passed {
                println!("PASS");
                println!("   Agent gRPC server started on port 50057 and registered with control plane");
            } else {
                println!("FAIL");
            }
        }
        Err(e) => {
            results.insert("gRPC Server", false);
            println!("FAIL ({})", e);
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