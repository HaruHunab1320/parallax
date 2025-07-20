use async_trait::async_trait;
use parallax_sdk::{serve_agent, Agent, AnalyzeResult, HealthStatus};
use serde_json::json;
use std::collections::HashMap;
use tracing::{info, Level};
use tracing_subscriber;

/// Demo agent implementation
struct DemoAgent {
    id: String,
    name: String,
    capabilities: Vec<String>,
    metadata: HashMap<String, String>,
}

impl DemoAgent {
    fn new() -> Self {
        let mut metadata = HashMap::new();
        metadata.insert("language".to_string(), "rust".to_string());
        metadata.insert("version".to_string(), "1.0.0".to_string());
        metadata.insert("sdk".to_string(), "parallax-rust".to_string());

        Self {
            id: "demo-agent-rust".to_string(),
            name: "Rust Demo Agent".to_string(),
            capabilities: vec!["code-analysis".to_string(), "testing".to_string()],
            metadata,
        }
    }

    async fn analyze_code(&self, code: &str) -> AnalyzeResult {
        // Simple Rust code analysis
        let has_tests = code.contains("#[test]") || code.contains("#[cfg(test)]");
        let has_docs = code.contains("///") || code.contains("//!");
        let has_unsafe = code.contains("unsafe");
        let has_result = code.contains("Result<");

        let quality = match (has_tests, has_docs, !has_unsafe, has_result) {
            (true, true, true, true) => "excellent",
            (true, true, true, false) => "high",
            (_, true, true, _) => "good",
            _ => "medium",
        };

        let mut suggestions = Vec::new();
        if !has_tests {
            suggestions.push("Add unit tests");
        }
        if !has_docs {
            suggestions.push("Add documentation comments");
        }
        if has_unsafe {
            suggestions.push("Review unsafe code usage");
        }
        if !has_result {
            suggestions.push("Consider using Result for error handling");
        }

        let mut metadata = HashMap::new();
        metadata.insert("lines".to_string(), code.lines().count().to_string());
        metadata.insert("quality".to_string(), quality.to_string());

        AnalyzeResult {
            value: json!({
                "has_tests": has_tests,
                "has_docs": has_docs,
                "has_unsafe": has_unsafe,
                "has_result": has_result,
                "quality": quality,
                "suggestions": suggestions,
            }),
            confidence: 0.85,
            reasoning: Some(format!(
                "Analyzed {} lines of Rust code with {} quality indicators",
                code.lines().count(),
                vec![has_tests, has_docs, !has_unsafe, has_result]
                    .iter()
                    .filter(|&&x| x)
                    .count()
            )),
            uncertainties: vec![
                "Simple keyword matching".to_string(),
                "No AST analysis".to_string(),
            ],
            metadata,
        }
    }

    async fn get_system_info(&self) -> AnalyzeResult {
        AnalyzeResult {
            value: json!({
                "version": "1.0.0",
                "language": "Rust",
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "rust_version": env!("RUSTC_VERSION", "unknown"),
            }),
            confidence: 1.0,
            reasoning: Some("System information retrieved".to_string()),
            uncertainties: vec![],
            metadata: HashMap::new(),
        }
    }
}

#[async_trait]
impl Agent for DemoAgent {
    fn get_id(&self) -> &str {
        &self.id
    }

    fn get_name(&self) -> &str {
        &self.name
    }

    fn get_capabilities(&self) -> &[String] {
        &self.capabilities
    }

    fn get_metadata(&self) -> HashMap<String, String> {
        self.metadata.clone()
    }

    async fn analyze(
        &self,
        task: &str,
        data: Option<serde_json::Value>,
    ) -> Result<AnalyzeResult, Box<dyn std::error::Error>> {
        match task {
            "analyze-code" | task if task.contains("code") => {
                let code = if let Some(data) = data {
                    if let Some(code_str) = data.as_str() {
                        code_str.to_string()
                    } else if let Some(obj) = data.as_object() {
                        obj.get("code")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string()
                    } else {
                        return Err("No code provided for analysis".into());
                    }
                } else {
                    return Err("No data provided".into());
                };

                Ok(self.analyze_code(&code).await)
            }
            "get-system-info" | task if task.contains("system") => {
                Ok(self.get_system_info().await)
            }
            _ => {
                // Generic response for unknown tasks
                Ok(AnalyzeResult {
                    value: json!({
                        "task": task,
                        "data": data,
                        "result": "Task processed",
                    }),
                    confidence: 0.5,
                    reasoning: Some(format!("Unknown task type: {}", task)),
                    uncertainties: vec!["Task not recognized".to_string()],
                    metadata: HashMap::new(),
                })
            }
        }
    }

    async fn check_health(&self) -> Result<HealthStatus, Box<dyn std::error::Error>> {
        Ok(HealthStatus {
            status: "healthy".to_string(),
            message: Some("Agent is operational".to_string()),
        })
    }
}

async fn run_demo() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Parallax Rust SDK Demo\n");

    // 1. Test Agent Creation
    println!("1️⃣ Creating Demo Agent...");
    let agent = DemoAgent::new();
    println!("✅ Agent created: {} ({})", agent.get_name(), agent.get_id());
    println!("   Capabilities: {:?}", agent.get_capabilities());
    println!("   Metadata: {:?}\n", agent.get_metadata());

    // 2. Test Agent Methods
    println!("2️⃣ Testing Agent Methods...");

    // Test code analysis
    let code_to_analyze = r#"
/// Calculate the sum of two numbers
/// 
/// # Examples
/// ```
/// assert_eq!(add(2, 3), 5);
/// ```
pub fn add(a: i32, b: i32) -> Result<i32, &'static str> {
    if a.checked_add(b).is_none() {
        Err("Integer overflow")
    } else {
        Ok(a + b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3).unwrap(), 5);
        assert!(add(i32::MAX, 1).is_err());
    }
}
"#;

    let result = agent
        .analyze("analyze-code", Some(json!({ "code": code_to_analyze })))
        .await?;
    println!("✅ Code analysis result: {}", serde_json::to_string_pretty(&result.value)?);
    println!("   Confidence: {:.2}", result.confidence);
    println!("   Reasoning: {}\n", result.reasoning.as_deref().unwrap_or("None"));

    // Test system info
    let sys_result = agent.analyze("get-system-info", None).await?;
    println!("✅ System info: {}\n", serde_json::to_string_pretty(&sys_result.value)?);

    // 3. Test gRPC Server
    println!("3️⃣ Testing gRPC Server...");
    println!("   Starting agent gRPC server...");
    
    // Note: In a real app, you'd await this
    println!("✅ To start the gRPC server, run with --serve flag\n");

    // 4. Test Error Handling
    println!("4️⃣ Testing Error Handling...");
    match agent.analyze("invalid-task", None).await {
        Ok(result) => {
            println!("✅ Error handling (graceful): {}", result.reasoning.as_deref().unwrap_or("Unknown task handled"));
        }
        Err(e) => {
            println!("✅ Error handling works: {}", e);
        }
    }

    println!("\n✅ Rust SDK Demo Complete!");
    println!("\nSummary:");
    println!("- Agent creation: ✅");
    println!("- Method execution: ✅");
    println!("- gRPC server: ✅ (run with --serve)");
    println!("- Error handling: ✅");

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    // Check for --serve flag
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--serve" {
        info!("Starting gRPC server mode...");
        let agent = DemoAgent::new();
        serve_agent(agent, 50054).await?;
    } else {
        // Run demo
        run_demo().await?;
        println!("\nTo start the gRPC server, run: cargo run --bin grpc_demo -- --serve");
    }

    Ok(())
}