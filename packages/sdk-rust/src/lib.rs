//! Parallax SDK for Rust
//! 
//! Official Rust SDK for the Parallax AI Coordination Platform.

pub mod client;
pub mod types;
pub mod patterns;
pub mod agent_service;
pub mod error;
pub mod generated;
pub mod parallax_agent;

pub use client::{Client, ClientConfig};
pub use types::*;

pub use error::{Error, Result};

// Re-export commonly used items
pub use patterns::PatternService;
pub use agent_service::AgentService;
pub use parallax_agent::{ParallaxAgent, AgentResult};