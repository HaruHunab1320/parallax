use crate::{
    error::Result,
    generated::parallax::executions::{
        execution_service_client::ExecutionServiceClient, Execution, ExecutionStatus,
        GetExecutionRequest, ListExecutionsRequest, StreamExecutionRequest,
    },
    types::{ExecutionStatus as LocalStatus, PatternExecution},
};
use futures::{Stream, StreamExt};
use prost_types::{value::Kind, ListValue, Struct, Value as ProtoValue};
use serde_json::Value;
use std::pin::Pin;
use tonic::transport::Channel;
use tracing::debug;

/// Service for execution operations
#[derive(Clone)]
pub struct ExecutionService {
    channel: Channel,
}

impl ExecutionService {
    pub(crate) fn new(channel: Channel) -> Self {
        Self { channel }
    }

    /// Get a specific execution by id
    pub async fn get(&self, execution_id: &str) -> Result<PatternExecution> {
        debug!("Getting execution: {}", execution_id);

        let mut client = ExecutionServiceClient::new(self.channel.clone());
        let response = client
            .get_execution(GetExecutionRequest {
                execution_id: execution_id.to_string(),
            })
            .await?
            .into_inner();

        Ok(execution_from_proto(response.execution))
    }

    /// List executions
    pub async fn list(
        &self,
        limit: i32,
        offset: i32,
        status: Option<String>,
    ) -> Result<Vec<PatternExecution>> {
        debug!("Listing executions");

        let mut client = ExecutionServiceClient::new(self.channel.clone());
        let response = client
            .list_executions(ListExecutionsRequest {
                limit,
                offset,
                status: status.unwrap_or_default(),
            })
            .await?
            .into_inner();

        Ok(response
            .executions
            .into_iter()
            .map(execution_from_proto)
            .collect())
    }

    /// Stream execution updates
    pub async fn stream(
        &self,
        execution_id: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<PatternExecution>> + Send>>> {
        debug!("Streaming execution: {}", execution_id);

        let mut client = ExecutionServiceClient::new(self.channel.clone());
        let stream = client
            .stream_execution(StreamExecutionRequest {
                execution_id: execution_id.to_string(),
            })
            .await?
            .into_inner();

        let mapped = stream.filter_map(|event| async move {
            match event {
                Ok(event) => event.execution.map(|execution| Ok(execution_from_proto(Some(execution)))),
                Err(error) => Some(Err(error.into())),
            }
        });

        Ok(Box::pin(mapped))
    }
}

fn execution_from_proto(execution: Option<Execution>) -> PatternExecution {
    let execution = execution.unwrap_or_default();
    let start_time = execution
        .start_time
        .map(timestamp_to_datetime)
        .unwrap_or_else(chrono::Utc::now);
    let end_time = execution.end_time.map(timestamp_to_datetime);
    let duration_ms = end_time
        .map(|end| (end - start_time).num_milliseconds().max(0) as u64);

    PatternExecution {
        id: execution.id,
        pattern: execution.pattern_name,
        status: status_from_proto(execution.status),
        input: execution.input.map(struct_to_json).unwrap_or(Value::Null),
        output: execution.result.map(struct_to_json),
        agents: Vec::new(),
        start_time,
        end_time,
        duration_ms,
        confidence: Some(execution.confidence),
        error: if execution.error.is_empty() {
            None
        } else {
            Some(execution.error)
        },
        metadata: execution
            .metrics
            .map(struct_to_json)
            .unwrap_or(Value::Null)
            .as_object()
            .cloned()
            .unwrap_or_default(),
    }
}

fn status_from_proto(status: i32) -> LocalStatus {
    match ExecutionStatus::from_i32(status).unwrap_or(ExecutionStatus::ExecutionStatusUnknown) {
        ExecutionStatus::ExecutionStatusCompleted => LocalStatus::Completed,
        ExecutionStatus::ExecutionStatusFailed => LocalStatus::Failed,
        ExecutionStatus::ExecutionStatusRunning => LocalStatus::Running,
        ExecutionStatus::ExecutionStatusCancelled => LocalStatus::Failed,
        ExecutionStatus::ExecutionStatusPending => LocalStatus::Pending,
        ExecutionStatus::ExecutionStatusUnknown => LocalStatus::Pending,
    }
}

fn struct_to_json(value: Struct) -> Value {
    Value::Object(
        value
            .fields
            .into_iter()
            .map(|(key, value)| (key, value_to_json(value)))
            .collect(),
    )
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
    let nanos = timestamp.nanos as u32;
    let seconds = timestamp.seconds;
    let naive = chrono::NaiveDateTime::from_timestamp_opt(seconds, nanos)
        .unwrap_or_else(|| chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap());
    chrono::DateTime::<chrono::Utc>::from_utc(naive, chrono::Utc)
}
