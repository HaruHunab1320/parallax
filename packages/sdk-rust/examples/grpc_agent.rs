use async_trait::async_trait;
use parallax_sdk::{serve_agent, Agent, AnalyzeResult, HealthStatus};
use serde_json::json;
use std::collections::HashMap;
use tracing::{info, Level};
use tracing_subscriber;

/// Example sentiment analysis agent
struct SentimentAgent {
    id: String,
    name: String,
    capabilities: Vec<String>,
}

impl SentimentAgent {
    fn new() -> Self {
        Self {
            id: format!("sentiment-agent-{}", rand::random::<u16>()),
            name: "Rust Sentiment Analyzer".to_string(),
            capabilities: vec![
                "sentiment".to_string(),
                "analysis".to_string(),
                "nlp".to_string(),
            ],
        }
    }
}

#[async_trait]
impl Agent for SentimentAgent {
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
        let mut metadata = HashMap::new();
        metadata.insert("language".to_string(), "rust".to_string());
        metadata.insert("version".to_string(), "1.0.0".to_string());
        metadata.insert("model".to_string(), "keyword-based".to_string());
        metadata
    }

    async fn analyze(
        &self,
        task: &str,
        data: Option<serde_json::Value>,
    ) -> Result<AnalyzeResult, Box<dyn std::error::Error>> {
        // Extract text from data
        let text = if let Some(data) = data {
            if let Some(text) = data.as_str() {
                text.to_string()
            } else if let Some(obj) = data.as_object() {
                obj.get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                return Err("No text provided for analysis".into());
            }
        } else {
            return Err("No data provided".into());
        };

        // Simple keyword-based sentiment analysis
        let positive_words = vec![
            "good", "great", "excellent", "love", "amazing", "wonderful", "fantastic",
        ];
        let negative_words = vec![
            "bad", "terrible", "hate", "awful", "horrible", "poor", "disappointing",
        ];

        let text_lower = text.to_lowercase();
        let positive_count = positive_words
            .iter()
            .filter(|word| text_lower.contains(word))
            .count();
        let negative_count = negative_words
            .iter()
            .filter(|word| text_lower.contains(word))
            .count();

        let (sentiment, confidence) = if positive_count > negative_count {
            ("positive", 0.8 + rand::random::<f64>() * 0.2)
        } else if negative_count > positive_count {
            ("negative", 0.8 + rand::random::<f64>() * 0.2)
        } else {
            ("neutral", 0.7 + rand::random::<f64>() * 0.25)
        };

        Ok(AnalyzeResult {
            value: json!({
                "sentiment": sentiment,
                "text": text,
                "positive_words": positive_count,
                "negative_words": negative_count,
            }),
            confidence,
            reasoning: Some(format!(
                "Analyzed text with {} positive and {} negative indicators",
                positive_count, negative_count
            )),
            uncertainties: vec![
                "Limited keyword matching".to_string(),
                "No context understanding".to_string(),
                "No sarcasm detection".to_string(),
            ],
            metadata: {
                let mut meta = HashMap::new();
                meta.insert("algorithm".to_string(), "keyword-matching".to_string());
                meta.insert("version".to_string(), "1.0".to_string());
                meta
            },
        })
    }

    async fn check_health(&self) -> Result<HealthStatus, Box<dyn std::error::Error>> {
        Ok(HealthStatus {
            status: "healthy".to_string(),
            message: Some("Agent is operational".to_string()),
        })
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    // Create agent
    let agent = SentimentAgent::new();

    info!(
        "Starting {} with ID {}",
        agent.get_name(),
        agent.get_id()
    );
    info!("Capabilities: {:?}", agent.get_capabilities());

    // Serve the agent
    serve_agent(agent, 0).await?;

    Ok(())
}