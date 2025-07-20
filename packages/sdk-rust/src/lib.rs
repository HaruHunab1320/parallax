//! Parallax SDK for Rust
//! 
//! Official Rust SDK for the Parallax AI Coordination Platform.

pub mod client;
pub mod types;
pub mod patterns;
pub mod agents;
pub mod error;
pub mod generated;
pub mod grpc_agent;

pub use client::{Client, ClientConfig};
pub use types::*;
pub use error::{Error, Result};

// Re-export commonly used items
pub use patterns::PatternService;
pub use agents::AgentService;
pub use grpc_agent::{Agent, GrpcAgent, AnalyzeResult, HealthStatus, serve_agent};