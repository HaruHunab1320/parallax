use crate::{
    error::{Error, Result},
    generated::parallax::patterns::{
        pattern_service_client::PatternServiceClient, ExecutePatternRequest, ListPatternsRequest,
    },
    types::{ExecuteOptions, Pattern, PatternExecution},
};
use futures::Stream;
use prost_types::{value::Kind, ListValue, Struct, Value as ProtoValue};
use serde_json::Value;
use std::{collections::{BTreeMap, HashMap}, pin::Pin};
use tonic::transport::Channel;
use tracing::{debug, info};

/// Service for pattern operations
#[derive(Clone)]
pub struct PatternService {
    _channel: Channel,
}

impl PatternService {
    pub(crate) fn new(channel: Channel) -> Self {
        Self { _channel: channel }
    }

    /// List all available patterns
    pub async fn list(&self) -> Result<Vec<Pattern>> {
        debug!("Listing patterns");

        let mut client = PatternServiceClient::new(self._channel.clone());
        let response = client
            .list_patterns(ListPatternsRequest {
                tags: vec![],
                include_scripts: false,
            })
            .await?
            .into_inner();

        Ok(response
            .patterns
            .into_iter()
            .map(pattern_from_proto)
            .collect())
    }

    /// Get a specific pattern by name
    pub async fn get(&self, name: &str) -> Result<Pattern> {
        debug!("Getting pattern: {}", name);
        
        let patterns = self.list().await?;
        patterns
            .into_iter()
            .find(|p| p.name == name)
            .ok_or_else(|| crate::error::Error::NotFound(format!("Pattern not found: {}", name)))
    }

    /// Execute a pattern
    pub async fn execute(
        &self,
        pattern: &str,
        input: Value,
        options: Option<ExecuteOptions>,
    ) -> Result<PatternExecution> {
        info!("Executing pattern: {}", pattern);
        
        let options = options.unwrap_or_default();

        let input_struct = json_to_struct(input.clone());
        let mut client = PatternServiceClient::new(self._channel.clone());
        let response = client
            .execute_pattern(ExecutePatternRequest {
                pattern_name: pattern.to_string(),
                pattern_version: String::new(),
                input: Some(input_struct),
                options: Some(crate::generated::parallax::patterns::execute_pattern_request::Options {
                    timeout_ms: options.timeout_ms.unwrap_or(30000) as i32,
                    max_parallel: 0,
                    cache_results: false,
                    context: HashMap::new(),
                }),
            })
            .await?
            .into_inner();

        Ok(execution_from_response(response, input, options.metadata))
    }

    /// Get execution status
    pub async fn get_execution(&self, execution_id: &str) -> Result<PatternExecution> {
        debug!("Getting execution: {}", execution_id);

        Err(Error::InvalidArgument(format!(
            "execution history is not supported via the gRPC API: {}",
            execution_id
        )))
    }

    /// List recent executions
    pub async fn list_executions(&self, limit: usize) -> Result<Vec<PatternExecution>> {
        debug!("Listing executions with limit: {}", limit);

        Err(Error::InvalidArgument(format!(
            "listing executions is not supported via the gRPC API (limit={})",
            limit
        )))
    }

    /// Stream execution updates
    pub async fn stream_executions(
        &self,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<PatternExecution>> + Send>>> {
        debug!("Streaming executions");

        Err(Error::InvalidArgument(
            "streaming executions is not supported via the gRPC API".to_string(),
        ))
    }
}

fn pattern_from_proto(pattern: crate::generated::parallax::patterns::Pattern) -> Pattern {
    let requirements = pattern.requirements.unwrap_or_default();

    Pattern {
        name: pattern.name,
        description: pattern.description,
        enabled: true,
        required_capabilities: requirements.capabilities,
        config: crate::types::PatternConfig {
            min_agents: Some(requirements.min_agents.max(0) as u32),
            max_agents: Some(requirements.max_agents.max(0) as u32),
            confidence_threshold: Some(requirements.min_confidence),
            ..Default::default()
        },
    }
}

fn execution_from_response(
    response: crate::generated::parallax::patterns::ExecutePatternResponse,
    input: Value,
    metadata: HashMap<String, Value>,
) -> PatternExecution {
    let metrics = response.metrics;
    let (start_time, end_time, duration_ms) = if let Some(metrics) = metrics {
        let start_time = metrics
            .start_time
            .map(timestamp_to_datetime)
            .unwrap_or_else(chrono::Utc::now);
        let end_time = metrics.end_time.map(timestamp_to_datetime);
        let duration_ms = end_time
            .map(|end| (end - start_time).num_milliseconds().max(0) as u64);
        (start_time, end_time, duration_ms)
    } else {
        (chrono::Utc::now(), None, None)
    };

    PatternExecution {
        id: response.execution_id,
        pattern: response.pattern_name,
        status: status_from_proto(response.status),
        input,
        output: response.result.map(struct_to_json),
        agents: Vec::new(),
        start_time,
        end_time,
        duration_ms,
        confidence: Some(response.confidence),
        error: if response.error_message.is_empty() {
            None
        } else {
            Some(response.error_message)
        },
        metadata,
    }
}

fn status_from_proto(status: i32) -> crate::types::ExecutionStatus {
    use crate::types::ExecutionStatus;
    use crate::generated::parallax::patterns::execute_pattern_response::Status;

    match Status::try_from(status).unwrap_or(Status::Unknown) {
        Status::Success => ExecutionStatus::Completed,
        Status::Failure | Status::Timeout | Status::Cancelled => ExecutionStatus::Failed,
        Status::Unknown => ExecutionStatus::Pending,
    }
}

fn json_to_struct(value: Value) -> Struct {
    match value {
        Value::Object(map) => Struct {
            fields: map
                .into_iter()
                .map(|(key, value)| (key, json_to_value(value)))
                .collect::<BTreeMap<_, _>>(),
        },
        other => {
            let mut fields = BTreeMap::new();
            fields.insert("value".to_string(), json_to_value(other));
            Struct { fields }
        }
    }
}

fn json_to_value(value: Value) -> ProtoValue {
    let kind = match value {
        Value::Null => Kind::NullValue(0),
        Value::Bool(value) => Kind::BoolValue(value),
        Value::Number(value) => Kind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => Kind::StringValue(value),
        Value::Array(values) => Kind::ListValue(ListValue {
            values: values.into_iter().map(json_to_value).collect(),
        }),
        Value::Object(values) => Kind::StructValue(Struct {
            fields: values
                .into_iter()
                .map(|(key, value)| (key, json_to_value(value)))
                .collect(),
        }),
    };

    ProtoValue { kind: Some(kind) }
}

fn struct_to_json(value: Struct) -> Value {
    let map: serde_json::Map<String, Value> = value
        .fields
        .into_iter()
        .map(|(key, value)| (key, value_to_json(value)))
        .collect();
    Value::Object(map)
}

fn value_to_json(value: ProtoValue) -> Value {
    match value.kind {
        Some(Kind::NullValue(_)) => Value::Null,
        Some(Kind::BoolValue(value)) => Value::Bool(value),
        Some(Kind::NumberValue(value)) => serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Some(Kind::StringValue(value)) => Value::String(value),
        Some(Kind::ListValue(list)) => Value::Array(
            list.values
                .into_iter()
                .map(value_to_json)
                .collect(),
        ),
        Some(Kind::StructValue(struct_value)) => struct_to_json(struct_value),
        None => Value::Null,
    }
}

fn timestamp_to_datetime(timestamp: prost_types::Timestamp) -> chrono::DateTime<chrono::Utc> {
    use chrono::TimeZone;
    let nanos = timestamp.nanos as u32;
    let seconds = timestamp.seconds;
    chrono::Utc
        .timestamp_opt(seconds, nanos)
        .single()
        .unwrap_or_else(|| chrono::Utc.timestamp_opt(0, 0).single().unwrap())
}
