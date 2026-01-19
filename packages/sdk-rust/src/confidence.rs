use std::collections::HashMap;
use regex::Regex;
use serde_json::Value;
use async_trait::async_trait;

use crate::parallax_agent::AgentResult;

/// Strategy for extracting confidence from results
#[derive(Debug, Clone, Copy)]
pub enum ExtractionStrategy {
    /// Extract from LLM-style structured responses
    Llm,
    /// Extract based on keyword analysis
    Keywords,
    /// Hybrid approach combining both strategies
    Hybrid,
}

/// Configuration for confidence extraction
#[derive(Debug, Clone)]
pub struct ConfidenceConfig {
    pub default_confidence: f64,
    pub strategy: ExtractionStrategy,
}

impl Default for ConfidenceConfig {
    fn default() -> Self {
        Self {
            default_confidence: 0.5,
            strategy: ExtractionStrategy::Hybrid,
        }
    }
}

/// Trait for adding confidence extraction to agents
#[async_trait]
pub trait WithConfidence {
    /// Wrap an analysis function to automatically extract confidence
    async fn with_confidence<F, Fut>(
        &self,
        analyze_fn: F,
        config: Option<ConfidenceConfig>,
    ) -> impl Fn(&str, Option<Value>) -> futures::future::BoxFuture<'_, Result<AgentResult, Box<dyn std::error::Error>>> + Send + Sync
    where
        F: Fn(&str, Option<Value>) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<Value, Box<dyn std::error::Error>>> + Send + 'static;
}

/// Implementation of confidence extraction for any type
pub struct ConfidenceExtractor {
    config: ConfidenceConfig,
}

impl ConfidenceExtractor {
    /// Create a new confidence extractor
    pub fn new(config: ConfidenceConfig) -> Self {
        Self { config }
    }
    
    /// Extract confidence from a result
    pub fn extract(&self, result: &Value) -> f64 {
        match self.config.strategy {
            ExtractionStrategy::Llm => self.extract_from_llm(result),
            ExtractionStrategy::Keywords => self.extract_from_keywords(result),
            ExtractionStrategy::Hybrid => {
                let llm_conf = self.extract_from_llm(result);
                let keyword_conf = self.extract_from_keywords(result);
                // Weighted average favoring LLM extraction
                0.7 * llm_conf + 0.3 * keyword_conf
            }
        }
    }
    
    /// Extract confidence from LLM-style responses
    fn extract_from_llm(&self, result: &Value) -> f64 {
        // Check for explicit confidence fields
        if let Some(obj) = result.as_object() {
            let confidence_fields = ["confidence", "_confidence", "score", "certainty", "probability"];
            
            for field in &confidence_fields {
                if let Some(val) = obj.get(*field) {
                    if let Some(conf) = self.normalize_confidence(val) {
                        return conf;
                    }
                }
            }
            
            // Check nested metadata
            if let Some(metadata) = obj.get("metadata").and_then(|m| m.as_object()) {
                for field in &confidence_fields {
                    if let Some(val) = metadata.get(*field) {
                        if let Some(conf) = self.normalize_confidence(val) {
                            return conf;
                        }
                    }
                }
            }
        }
        
        // Try to extract from text representation
        let text = result.to_string();
        
        // Confidence patterns
        let patterns = [
            r"confidence:\s*(\d+\.?\d*)",
            r"certainty:\s*(\d+\.?\d*)",
            r"probability:\s*(\d+\.?\d*)",
            r"score:\s*(\d+\.?\d*)",
            r"(\d+\.?\d*)\s*%\s*(?:confident|certain|sure)",
        ];
        
        for pattern in &patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(caps) = re.captures(&text) {
                    if let Some(match_str) = caps.get(1) {
                        if let Ok(val) = match_str.as_str().parse::<f64>() {
                            return self.normalize_confidence_value(val);
                        }
                    }
                }
            }
        }
        
        self.config.default_confidence
    }
    
    /// Extract confidence based on keyword analysis
    fn extract_from_keywords(&self, result: &Value) -> f64 {
        let text = result.to_string().to_lowercase();
        let mut score = self.config.default_confidence;
        
        // High confidence indicators
        let high_confidence: HashMap<&str, f64> = [
            ("definitely", 0.15),
            ("certainly", 0.15),
            ("absolutely", 0.15),
            ("confirmed", 0.15),
            ("verified", 0.15),
            ("guaranteed", 0.15),
            ("certain", 0.12),
            ("sure", 0.12),
            ("clear", 0.10),
            ("obvious", 0.10),
            ("undoubtedly", 0.12),
            ("unquestionably", 0.12),
            ("conclusive", 0.12),
            ("definitive", 0.12),
            ("established", 0.10),
        ].iter().cloned().collect();
        
        // Medium confidence indicators
        let medium_confidence: HashMap<&str, f64> = [
            ("probably", 0.05),
            ("likely", 0.05),
            ("appears", 0.05),
            ("seems", 0.05),
            ("suggests", 0.05),
            ("indicates", 0.05),
            ("mostly", 0.04),
            ("generally", 0.04),
            ("typically", 0.04),
            ("reasonable", 0.05),
            ("plausible", 0.05),
            ("expected", 0.04),
        ].iter().cloned().collect();
        
        // Low confidence indicators
        let low_confidence: HashMap<&str, f64> = [
            ("possibly", -0.15),
            ("maybe", -0.15),
            ("might", -0.12),
            ("could", -0.10),
            ("uncertain", -0.15),
            ("unclear", -0.15),
            ("unsure", -0.15),
            ("doubt", -0.15),
            ("guess", -0.12),
            ("assume", -0.10),
            ("questionable", -0.15),
            ("tentative", -0.12),
            ("approximate", -0.08),
            ("estimated", -0.08),
            ("roughly", -0.08),
        ].iter().cloned().collect();
        
        // Apply modifiers
        for (word, modifier) in high_confidence {
            if text.contains(word) {
                score += modifier;
            }
        }
        
        for (word, modifier) in medium_confidence {
            if text.contains(word) {
                score += modifier;
            }
        }
        
        for (word, modifier) in low_confidence {
            if text.contains(word) {
                score += modifier;
            }
        }
        
        // Check for hedging patterns
        let hedging_patterns = [
            r"(?:i|we)\s+(?:think|believe|suppose)",
            r"(?:may|might)\s+be",
            r"(?:could|would)\s+(?:be|suggest)",
            r"(?:perhaps|presumably)",
        ];
        
        for pattern in &hedging_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(&text) {
                    score -= 0.1;
                }
            }
        }
        
        // Clamp to valid range
        score.max(0.1).min(0.95)
    }
    
    /// Normalize a confidence value to 0.0-1.0 range
    fn normalize_confidence(&self, value: &Value) -> Option<f64> {
        match value {
            Value::Number(n) => n.as_f64().map(|v| self.normalize_confidence_value(v)),
            Value::String(s) => {
                let cleaned = s.trim().trim_end_matches('%');
                cleaned.parse::<f64>().ok().map(|v| self.normalize_confidence_value(v))
            }
            _ => None,
        }
    }
    
    /// Normalize a numeric confidence value
    fn normalize_confidence_value(&self, value: f64) -> f64 {
        if (0.0..=1.0).contains(&value) {
            value
        } else if value > 1.0 && value <= 100.0 {
            value / 100.0
        } else {
            self.config.default_confidence
        }
    }
}

/// Wrapper function for creating confidence-aware analysis functions
pub fn with_confidence<F, Fut>(
    analyze_fn: F,
    config: Option<ConfidenceConfig>,
) -> impl Fn(&str, Option<Value>) -> futures::future::BoxFuture<'_, Result<AgentResult, Box<dyn std::error::Error>>> + Send + Sync
where
    F: Fn(&str, Option<Value>) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<Value, Box<dyn std::error::Error>>> + Send + 'static,
{
    let config = config.unwrap_or_default();
    let extractor = std::sync::Arc::new(ConfidenceExtractor::new(config));
    
    move |task: &str, data: Option<Value>| {
        let task = task.to_string();
        let fut = analyze_fn(&task, data);
        let extractor = extractor.clone();
        
        Box::pin(async move {
            let result_value = fut.await?;
            let confidence = extractor.extract(&result_value);
            
            Ok(AgentResult {
                value: result_value,
                confidence,
                reasoning: None,
                uncertainties: Vec::new(),
                metadata: HashMap::new(),
            })
        })
    }
}

/// Aggregator for combining multiple confidence values
pub struct ConfidenceAggregator;

impl ConfidenceAggregator {
    /// Combine multiple confidence values using the specified strategy
    pub fn combine(confidences: &[f64], strategy: &str, weights: Option<&[f64]>) -> f64 {
        if confidences.is_empty() {
            return 0.5;
        }
        
        match strategy {
            "min" => confidences.iter().cloned().fold(f64::INFINITY, f64::min),
            "max" => confidences.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
            "avg" => confidences.iter().sum::<f64>() / confidences.len() as f64,
            "weighted_avg" => {
                if let Some(w) = weights {
                    if w.len() == confidences.len() {
                        let weighted_sum: f64 = confidences.iter().zip(w.iter())
                            .map(|(c, w)| c * w)
                            .sum();
                        let total_weight: f64 = w.iter().sum();
                        if total_weight > 0.0 {
                            return weighted_sum / total_weight;
                        }
                    }
                }
                // Default to linearly increasing weights
                let weighted_sum: f64 = confidences.iter().enumerate()
                    .map(|(i, c)| c * (i + 1) as f64)
                    .sum();
                let total_weight: f64 = (1..=confidences.len()).sum::<usize>() as f64;
                weighted_sum / total_weight
            }
            "consensus" => {
                // Higher confidence when values agree
                let mean = confidences.iter().sum::<f64>() / confidences.len() as f64;
                let variance = confidences.iter()
                    .map(|c| (c - mean).powi(2))
                    .sum::<f64>() / confidences.len() as f64;
                // Low variance = high consensus
                let consensus_factor = 1.0 - (variance * 2.0).min(0.5);
                mean * consensus_factor
            }
            _ => confidences.iter().sum::<f64>() / confidences.len() as f64,
        }
    }
    
    /// Calculate confidence based on result consistency
    pub fn from_consistency(results: &[Value]) -> f64 {
        if results.len() < 2 {
            return 0.5;
        }
        
        // Convert results to comparable strings
        let str_results: Vec<String> = results.iter()
            .map(|r| serde_json::to_string(r).unwrap_or_else(|_| r.to_string()))
            .collect();
        
        // Count unique results
        let unique_count = str_results.iter()
            .collect::<std::collections::HashSet<_>>()
            .len();
        
        // Perfect agreement = high confidence
        if unique_count == 1 {
            return 0.95;
        }
        
        // Calculate consistency score
        let consistency = 1.0 - (unique_count - 1) as f64 / (results.len() - 1) as f64;
        
        // Map to confidence range 0.5-0.95
        0.5 + (consistency * 0.45)
    }
    
    /// Calibrate confidence based on historical accuracy
    pub fn calibrate(raw_confidence: f64, bias: f64, scale: f64) -> f64 {
        // Apply calibration
        let calibrated = (raw_confidence - 0.5) * scale + 0.5 - bias;
        
        // Ensure valid range
        calibrated.max(0.0).min(1.0)
    }
}

/// Macro for requiring minimum confidence threshold
#[macro_export]
macro_rules! require_confidence {
    ($min_confidence:expr, $analyze_fn:expr) => {
        move |task: &str, data: Option<Value>| -> futures::future::BoxFuture<'_, Result<AgentResult, Box<dyn std::error::Error>>> {
            Box::pin(async move {
                let result = $analyze_fn(task, data).await?;
                if result.confidence < $min_confidence {
                    return Err(format!(
                        "Confidence {:.2} below required threshold {:.2}",
                        result.confidence, $min_confidence
                    ).into());
                }
                Ok(result)
            })
        }
    };
}
