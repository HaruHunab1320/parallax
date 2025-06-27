use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Represents an AI agent in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub status: AgentStatus,
    pub capabilities: Vec<String>,
    pub endpoint: String,
    pub last_seen: DateTime<Utc>,
    pub confidence: f64,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Agent status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Active,
    Inactive,
    Error,
}

/// Represents a coordination pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub required_capabilities: Vec<String>,
    pub config: PatternConfig,
}

/// Pattern-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PatternConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_agents: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_agents: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consensus_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Represents the execution of a pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternExecution {
    pub id: String,
    pub pattern: String,
    pub status: ExecutionStatus,
    pub input: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    pub agents: Vec<String>,
    pub start_time: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Execution status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

/// Options for pattern execution
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecuteOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub async_execution: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_selector: Option<AgentSelector>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
}

/// Agent selection criteria
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentSelector {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<SelectionStrategy>,
}

/// Agent selection strategy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionStrategy {
    Random,
    RoundRobin,
    BestFit,
    All,
}

impl Default for AgentStatus {
    fn default() -> Self {
        AgentStatus::Active
    }
}

impl Default for ExecutionStatus {
    fn default() -> Self {
        ExecutionStatus::Pending
    }
}

impl Agent {
    /// Create a new agent
    pub fn new(name: impl Into<String>, capabilities: Vec<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            status: AgentStatus::Active,
            capabilities,
            endpoint: String::new(),
            last_seen: Utc::now(),
            confidence: 0.8,
            metadata: HashMap::new(),
        }
    }
    
    /// Set the agent endpoint
    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }
    
    /// Add metadata
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}