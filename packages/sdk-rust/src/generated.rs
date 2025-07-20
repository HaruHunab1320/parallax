// Include generated protobuf files
pub mod parallax {
    pub mod confidence {
        include!("../generated/parallax.confidence.rs");
    }
    pub mod registry {
        include!("../generated/parallax.registry.rs");
    }
    pub mod patterns {
        include!("../generated/parallax.patterns.rs");
    }
    pub mod coordinator {
        include!("../generated/parallax.coordinator.rs");
    }
}

// Re-export for convenience
pub use parallax::confidence::*;
pub use parallax::registry::*;