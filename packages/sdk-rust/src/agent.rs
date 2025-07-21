use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Agent information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub capabilities: Vec<String>,
    pub expertise: f64,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Agent response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub value: serde_json::Value,
    pub confidence: f64,
    pub reasoning: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Trait that agents must implement
#[async_trait]
pub trait Agent: Send + Sync {
    /// Get agent info
    fn info(&self) -> &AgentInfo;
    
    /// Analyze a task
    async fn analyze(&self, task: &str, input: serde_json::Value) -> anyhow::Result<AgentResponse>;
}