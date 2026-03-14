use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::signal;
use tokio::sync::Mutex;
use tokio::time::interval;
use tonic::{transport::Server, Request, Response, Status};
use tracing::{error, info, warn};

// Import generated proto types
use crate::generated::{
    confidence_agent_server::{ConfidenceAgent, ConfidenceAgentServer},
    registry_client::RegistryClient,
    agent_registration,
    health::Status as HealthStatusProto,
    AgentRequest, AgentRegistration, Capabilities, ConfidenceResult, Health,
    RegisterRequest, RenewRequest,
};

// Import gateway proto types
use crate::generated::parallax::gateway::{
    agent_gateway_client::AgentGatewayClient,
    agent_to_control_plane,
    control_plane_to_agent,
    AgentToControlPlane, AgentHello, AgentHeartbeat,
    TaskResult as GatewayTaskResult, TaskError as GatewayTaskError,
};

/// Result of an agent's analysis
#[derive(Debug, Clone)]
pub struct AgentResult {
    pub value: serde_json::Value,
    pub confidence: f64,
    pub reasoning: Option<String>,
    pub uncertainties: Vec<String>,
    pub metadata: HashMap<String, String>,
}

/// Options for gateway connection
#[derive(Debug, Clone)]
pub struct GatewayOptions {
    /// TLS configuration for the gateway connection
    pub credentials: Option<tonic::transport::ClientTlsConfig>,
    /// Heartbeat interval in milliseconds (default: 10000)
    pub heartbeat_interval_ms: u64,
    /// Whether to automatically reconnect on disconnect (default: true)
    pub auto_reconnect: bool,
    /// Maximum number of reconnection attempts (None = infinite)
    pub max_reconnect_attempts: Option<u32>,
    /// Initial delay before first reconnect attempt in milliseconds (default: 1000)
    pub initial_reconnect_delay_ms: u64,
    /// Maximum delay between reconnect attempts in milliseconds (default: 30000)
    pub max_reconnect_delay_ms: u64,
}

impl Default for GatewayOptions {
    fn default() -> Self {
        Self {
            credentials: None,
            heartbeat_interval_ms: 10000,
            auto_reconnect: true,
            max_reconnect_attempts: None,
            initial_reconnect_delay_ms: 1000,
            max_reconnect_delay_ms: 30000,
        }
    }
}

/// Calculate reconnect delay with exponential backoff
fn calculate_reconnect_delay(
    attempt: u32,
    initial_delay_ms: u64,
    max_delay_ms: u64,
) -> u64 {
    let delay = initial_delay_ms.saturating_mul(2u64.saturating_pow(attempt));
    delay.min(max_delay_ms)
}

/// Convert prost Value to serde_json Value
fn prost_value_to_json(value: prost_types::Value) -> serde_json::Value {
    use prost_types::value::Kind;
    match value.kind {
        Some(Kind::NullValue(_)) => serde_json::Value::Null,
        Some(Kind::NumberValue(n)) => serde_json::json!(n),
        Some(Kind::StringValue(s)) => serde_json::json!(s),
        Some(Kind::BoolValue(b)) => serde_json::json!(b),
        Some(Kind::StructValue(s)) => {
            let map: serde_json::Map<String, serde_json::Value> = s.fields
                .into_iter()
                .map(|(k, v)| (k, prost_value_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
        Some(Kind::ListValue(list)) => {
            let vec: Vec<serde_json::Value> = list.values
                .into_iter()
                .map(prost_value_to_json)
                .collect();
            serde_json::Value::Array(vec)
        }
        None => serde_json::Value::Null,
    }
}

/// Base agent struct that handles all gRPC functionality
pub struct ParallaxAgent {
    pub id: String,
    pub name: String,
    pub capabilities: Vec<String>,
    pub metadata: HashMap<String, String>,
    
    // Internal state
    registry_addr: String,
    lease_id: Arc<Mutex<Option<String>>>,
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    
    // Gateway state
    gateway_shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    gateway_reconnecting: Arc<Mutex<bool>>,

    // The analysis function that subclasses implement
    pub analyze_fn: Arc<dyn Fn(&str, Option<serde_json::Value>) -> futures::future::BoxFuture<'_, Result<AgentResult, Box<dyn std::error::Error>>> + Send + Sync>,
}

impl ParallaxAgent {
    /// Create a new ParallaxAgent
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        capabilities: Vec<String>,
        metadata: HashMap<String, String>,
    ) -> Self {
        let registry_addr = std::env::var("PARALLAX_REGISTRY")
            .unwrap_or_else(|_| "http://localhost:50051".to_string());
            
        Self {
            id: id.into(),
            name: name.into(),
            capabilities,
            metadata,
            registry_addr,
            lease_id: Arc::new(Mutex::new(None)),
            shutdown_tx: Arc::new(Mutex::new(None)),
            gateway_shutdown_tx: Arc::new(Mutex::new(None)),
            gateway_reconnecting: Arc::new(Mutex::new(false)),
            analyze_fn: Arc::new(|_, _| Box::pin(async {
                Err("analyze function not set".into())
            })),
        }
    }
    
    /// Set the analyze function
    pub fn set_analyze_fn<F, Fut>(mut self, f: F) -> Self 
    where
        F: Fn(&str, Option<serde_json::Value>) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<AgentResult, Box<dyn std::error::Error>>> + Send + 'static,
    {
        self.analyze_fn = Arc::new(move |task, data| Box::pin(f(task, data)));
        self
    }
    
    /// Start the gRPC server and register with control plane
    pub async fn serve(self: Arc<Self>, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("0.0.0.0:{}", port).parse::<SocketAddr>()?;
        
        info!(
            agent_id = %self.id,
            agent_name = %self.name,
            "Starting agent gRPC server on {}",
            addr
        );
        
        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        {
            let mut tx = self.shutdown_tx.lock().await;
            *tx = Some(shutdown_tx);
        }
        
        // Register with control plane
        let self_clone = Arc::clone(&self);
        tokio::spawn(async move {
            if let Err(e) = self_clone.register(port).await {
                error!("Failed to register with control plane: {}", e);
            }
        });
        
        // Start lease renewal
        let self_clone = Arc::clone(&self);
        tokio::spawn(async move {
            self_clone.start_lease_renewal().await;
        });
        
        // Create gRPC service
        let service = ConfidenceAgentServer::new(self);
        
        // Start server with graceful shutdown
        Server::builder()
            .add_service(service)
            .serve_with_shutdown(addr, async {
                let _ = shutdown_rx.await;
                info!("Shutting down gRPC server");
            })
            .await?;
            
        Ok(())
    }
    
    /// Register with the control plane
    async fn register(&self, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = RegistryClient::connect(self.registry_addr.clone()).await?;
        
        let agent_reg = AgentRegistration {
            id: self.id.clone(),
            name: self.name.clone(),
            endpoint: format!("localhost:{}", port),
            capabilities: self.capabilities.clone(),
            metadata: Some(agent_registration::Metadata {
                labels: self.metadata.clone(),
                version: String::new(),
                region: String::new(),
                default_confidence: 0.0,
            }),
            ..Default::default()
        };
        
        let request = Request::new(RegisterRequest {
            agent: Some(agent_reg),
            auto_renew: true,
        });
        
        let response = client.register(request).await?;
        let resp = response.into_inner();
        
        if !resp.lease_id.is_empty() {
            let mut lid = self.lease_id.lock().await;
            *lid = Some(resp.lease_id.clone());
            info!(
                agent_id = %self.id,
                lease_id = %resp.lease_id,
                "Agent registered with control plane"
            );
        }
        
        Ok(())
    }
    
    /// Start lease renewal loop
    async fn start_lease_renewal(&self) {
        let mut interval = interval(Duration::from_secs(30));
        
        loop {
            interval.tick().await;
            
            let lease_id = {
                let lid = self.lease_id.lock().await;
                lid.clone()
            };
            
            if let Some(lease_id) = lease_id {
                match self.renew_lease(&lease_id).await {
                    Ok(true) => {
                        // Lease renewed successfully
                    }
                    Ok(false) => {
                        warn!("Lease renewal failed, re-registering");
                        if let Err(e) = self.register(0).await { // Use 0 to keep same port
                            error!("Failed to re-register: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("Error renewing lease: {}", e);
                    }
                }
            }
        }
    }
    
    /// Renew lease with registry
    async fn renew_lease(&self, lease_id: &str) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let mut client = RegistryClient::connect(self.registry_addr.clone()).await?;
        
        let request = Request::new(RenewRequest {
            lease_id: lease_id.to_string(),
            ttl: None,
        });
        
        let response = client.renew(request).await?;
        Ok(response.into_inner().success)
    }
    
    /// Connect to the control plane via the Agent Gateway (bidirectional stream).
    /// Use this instead of serve() for agents behind NAT or without a public endpoint.
    /// The agent opens an outbound connection; tasks are received through the stream.
    pub async fn connect_via_gateway(
        self: &Arc<Self>,
        endpoint: &str,
        options: Option<GatewayOptions>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let opts = options.unwrap_or_default();
        let heartbeat_interval_ms = opts.heartbeat_interval_ms;
        let endpoint_owned = endpoint.to_string();

        // Build channel with optional TLS
        let channel = if let Some(tls_config) = &opts.credentials {
            tonic::transport::Channel::from_shared(endpoint_owned.clone())?
                .tls_config(tls_config.clone())?
                .connect()
                .await?
        } else {
            tonic::transport::Channel::from_shared(endpoint_owned.clone())?
                .connect()
                .await?
        };

        let mut client = AgentGatewayClient::new(channel);

        // Create a channel for sending messages to the stream
        let (tx, rx) = tokio::sync::mpsc::channel::<AgentToControlPlane>(32);
        let rx_stream = tokio_stream::wrappers::ReceiverStream::new(rx);

        // Open bidirectional stream
        let response = client.connect(rx_stream).await?;
        let mut inbound = response.into_inner();

        // Send AgentHello
        let hello = AgentToControlPlane {
            request_id: format!("hello-{}", self.id),
            payload: Some(agent_to_control_plane::Payload::Hello(AgentHello {
                agent_id: self.id.clone(),
                agent_name: self.name.clone(),
                capabilities: self.capabilities.clone(),
                metadata: self.metadata.clone(),
                heartbeat_interval_ms: heartbeat_interval_ms as i32,
            })),
        };
        tx.send(hello).await.map_err(|e| format!("Failed to send hello: {}", e))?;

        info!(
            agent_id = %self.id,
            agent_name = %self.name,
            endpoint = %endpoint_owned,
            "Connecting via gateway"
        );

        // Wait for ServerAck
        let ack_timeout = Duration::from_secs(10);
        let ack_msg = tokio::time::timeout(ack_timeout, inbound.message()).await
            .map_err(|_| "Gateway connection timed out waiting for ack")?
            .map_err(|e| format!("Stream error waiting for ack: {}", e))?
            .ok_or("Stream ended before receiving ack")?;

        if let Some(control_plane_to_agent::Payload::Ack(ack)) = ack_msg.payload {
            if !ack.accepted {
                return Err(format!("Gateway rejected agent: {}", ack.message).into());
            }
            info!(
                agent_id = %self.id,
                node_id = %ack.assigned_node_id,
                "Connected via gateway"
            );
        } else {
            return Err("Expected ServerAck but received different message".into());
        }

        // Create gateway shutdown channel
        let (gw_shutdown_tx, mut gw_shutdown_rx) = tokio::sync::oneshot::channel();
        {
            let mut shutdown = self.gateway_shutdown_tx.lock().await;
            *shutdown = Some(gw_shutdown_tx);
        }

        // Spawn heartbeat task
        let tx_heartbeat = tx.clone();
        let agent_id = self.id.clone();
        let heartbeat_handle = tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(heartbeat_interval_ms));
            loop {
                interval.tick().await;
                let heartbeat = AgentToControlPlane {
                    request_id: String::new(),
                    payload: Some(agent_to_control_plane::Payload::Heartbeat(AgentHeartbeat {
                        agent_id: agent_id.clone(),
                        load: 0.0,
                        status: "healthy".to_string(),
                        extra: HashMap::new(),
                    })),
                };
                if tx_heartbeat.send(heartbeat).await.is_err() {
                    break;
                }
            }
        });

        // Spawn message receiver task
        let self_clone = Arc::clone(self);
        let tx_response = tx.clone();
        let endpoint_for_reconnect = endpoint_owned.clone();
        let opts_for_reconnect = opts.clone();
        let receiver_handle = tokio::spawn(async move {
            loop {
                match inbound.message().await {
                    Ok(Some(msg)) => {
                        let request_id = msg.request_id.clone();
                        match msg.payload {
                            Some(control_plane_to_agent::Payload::TaskRequest(task_req)) => {
                                let analyze_fn = Arc::clone(&self_clone.analyze_fn);
                                let tx_task = tx_response.clone();
                                let task_id = task_req.task_id.clone();

                                // Parse data from Struct
                                let data = task_req.data.map(|s| {
                                    let map: serde_json::Map<String, serde_json::Value> = s
                                        .fields
                                        .into_iter()
                                        .map(|(k, v)| (k, prost_value_to_json(v)))
                                        .collect();
                                    serde_json::Value::Object(map)
                                });

                                tokio::spawn(async move {
                                    match analyze_fn(&task_req.task_description, data).await {
                                        Ok(result) => {
                                            let value_json = serde_json::to_string(&result.value)
                                                .unwrap_or_else(|_| "null".to_string());
                                            let msg = AgentToControlPlane {
                                                request_id,
                                                payload: Some(agent_to_control_plane::Payload::TaskResult(
                                                    GatewayTaskResult {
                                                        task_id,
                                                        value_json,
                                                        confidence: result.confidence,
                                                        reasoning: result.reasoning.unwrap_or_default(),
                                                        metadata: result.metadata,
                                                    },
                                                )),
                                            };
                                            let _ = tx_task.send(msg).await;
                                        }
                                        Err(e) => {
                                            let msg = AgentToControlPlane {
                                                request_id,
                                                payload: Some(agent_to_control_plane::Payload::TaskError(
                                                    GatewayTaskError {
                                                        task_id,
                                                        error_message: e.to_string(),
                                                        error_code: "INTERNAL".to_string(),
                                                    },
                                                )),
                                            };
                                            let _ = tx_task.send(msg).await;
                                        }
                                    }
                                });
                            }
                            Some(control_plane_to_agent::Payload::CancelTask(cancel)) => {
                                info!(
                                    task_id = %cancel.task_id,
                                    reason = %cancel.reason,
                                    "Task cancelled"
                                );
                            }
                            Some(control_plane_to_agent::Payload::Ping(_)) => {
                                let heartbeat = AgentToControlPlane {
                                    request_id: String::new(),
                                    payload: Some(agent_to_control_plane::Payload::Heartbeat(
                                        AgentHeartbeat {
                                            agent_id: self_clone.id.clone(),
                                            load: 0.0,
                                            status: "healthy".to_string(),
                                            extra: HashMap::new(),
                                        },
                                    )),
                                };
                                if tx_response.send(heartbeat).await.is_err() {
                                    break;
                                }
                            }
                            Some(control_plane_to_agent::Payload::Ack(_)) => {
                                // Already handled during initial connection
                            }
                            None => {}
                        }
                    }
                    Ok(None) => {
                        info!("Gateway stream ended");
                        break;
                    }
                    Err(e) => {
                        error!("Gateway stream error: {}", e);
                        break;
                    }
                }
            }

            // Stream disconnected - attempt reconnect
            heartbeat_handle.abort();
            Self::handle_gateway_reconnect(
                self_clone,
                &endpoint_for_reconnect,
                opts_for_reconnect,
            )
            .await;
        });

        // Wait for shutdown signal or receiver to finish
        tokio::spawn(async move {
            tokio::select! {
                _ = &mut gw_shutdown_rx => {
                    receiver_handle.abort();
                }
                _ = async { receiver_handle.await } => {
                    // Receiver ended on its own (disconnect/error)
                }
            }
        });

        Ok(())
    }

    /// Handle gateway disconnection with auto-reconnect using exponential backoff
    async fn handle_gateway_reconnect(
        agent: Arc<Self>,
        endpoint: &str,
        options: GatewayOptions,
    ) {
        if !options.auto_reconnect {
            return;
        }

        {
            let mut reconnecting = agent.gateway_reconnecting.lock().await;
            if *reconnecting {
                return;
            }
            *reconnecting = true;
        }

        let max_attempts = options.max_reconnect_attempts;
        let initial_delay = options.initial_reconnect_delay_ms;
        let max_delay = options.max_reconnect_delay_ms;
        let mut attempt: u32 = 0;

        loop {
            if let Some(max) = max_attempts {
                if attempt >= max {
                    error!(
                        agent_id = %agent.id,
                        attempts = attempt,
                        "Gateway reconnect failed after max attempts"
                    );
                    break;
                }
            }

            let delay = calculate_reconnect_delay(attempt, initial_delay, max_delay);
            attempt += 1;

            info!(
                agent_id = %agent.id,
                delay_ms = delay,
                attempt = attempt,
                "Gateway reconnecting"
            );

            tokio::time::sleep(Duration::from_millis(delay)).await;

            match agent
                .connect_via_gateway(endpoint, Some(options.clone()))
                .await
            {
                Ok(()) => {
                    info!(agent_id = %agent.id, "Gateway reconnected successfully");
                    break;
                }
                Err(e) => {
                    error!(
                        agent_id = %agent.id,
                        attempt = attempt,
                        error = %e,
                        "Gateway reconnect attempt failed"
                    );
                }
            }
        }

        let mut reconnecting = agent.gateway_reconnecting.lock().await;
        *reconnecting = false;
    }

    /// Shutdown the agent
    pub async fn shutdown(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!(agent_id = %self.id, "Shutting down agent");

        // Prevent reconnect during shutdown
        {
            let mut reconnecting = self.gateway_reconnecting.lock().await;
            *reconnecting = true;
        }

        // Shut down gateway connection
        if let Some(tx) = self.gateway_shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }

        // Unregister from control plane
        // Note: In a real implementation, we'd have an unregister method in the Registry service

        // Trigger server shutdown
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }

        Ok(())
    }
}

#[async_trait]
impl ConfidenceAgent for Arc<ParallaxAgent> {
    async fn analyze(
        &self,
        request: Request<AgentRequest>,
    ) -> Result<Response<ConfidenceResult>, Status> {
        let req = request.into_inner();
        
        if req.task_description.is_empty() {
            return Err(Status::invalid_argument("task description is required"));
        }
        
        // Parse data if provided
        let data = if let Some(data_struct) = req.data {
            let json_value = serde_json::Value::Object(
                data_struct.fields.into_iter()
                    .map(|(k, v)| (k, prost_value_to_json(v)))
                    .collect()
            );
            Some(json_value)
        } else {
            None
        };
        
        // Call the analyze function
        let result = (self.analyze_fn)(&req.task_description, data)
            .await
            .map_err(|e| Status::internal(format!("analysis failed: {}", e)))?;
        
        // Build response
        let response = ConfidenceResult {
            value_json: serde_json::to_string(&result.value)
                .map_err(|e| Status::internal(format!("failed to serialize result: {}", e)))?,
            confidence: result.confidence,
            agent_id: self.id.clone(),
            timestamp: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            reasoning: result.reasoning.unwrap_or_default(),
            uncertainties: result.uncertainties,
            metadata: result.metadata,
        };
        
        Ok(Response::new(response))
    }
    
    type StreamAnalyzeStream = tokio_stream::wrappers::ReceiverStream<Result<ConfidenceResult, Status>>;
    
    async fn stream_analyze(
        &self,
        request: Request<AgentRequest>,
    ) -> Result<Response<Self::StreamAnalyzeStream>, Status> {
        // For now, just analyze once and stream the result
        let result = self.analyze(request).await?;
        
        let (tx, rx) = tokio::sync::mpsc::channel(1);
        tx.send(Ok(result.into_inner())).await.unwrap();
        
        Ok(Response::new(tokio_stream::wrappers::ReceiverStream::new(rx)))
    }
    
    async fn get_capabilities(
        &self,
        _request: Request<()>,
    ) -> Result<Response<Capabilities>, Status> {
        Ok(Response::new(Capabilities {
            agent_id: self.id.clone(),
            name: self.name.clone(),
            capabilities: self.capabilities.clone(),
            expertise_level: 0.8,
            capability_scores: HashMap::new(),
        }))
    }
    
    async fn health_check(
        &self,
        _request: Request<()>,
    ) -> Result<Response<Health>, Status> {
        Ok(Response::new(Health {
            status: HealthStatusProto::Healthy as i32,
            message: "Agent is operational".to_string(),
            last_check: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            details: HashMap::new(),
        }))
    }
}

/// Helper function to serve an agent
pub async fn serve_agent(agent: Arc<ParallaxAgent>, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    // Handle shutdown signals
    let agent_clone = Arc::clone(&agent);
    tokio::spawn(async move {
        match signal::ctrl_c().await {
            Ok(()) => {
                info!("Received shutdown signal");
                let _ = agent_clone.shutdown().await;
            }
            Err(err) => {
                error!("Unable to listen for shutdown signal: {}", err);
            }
        }
    });
    
    agent.serve(port).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gateway_options_default() {
        let opts = GatewayOptions::default();
        assert!(opts.credentials.is_none());
        assert_eq!(opts.heartbeat_interval_ms, 10000);
        assert!(opts.auto_reconnect);
        assert!(opts.max_reconnect_attempts.is_none());
        assert_eq!(opts.initial_reconnect_delay_ms, 1000);
        assert_eq!(opts.max_reconnect_delay_ms, 30000);
    }

    #[test]
    fn test_gateway_options_custom() {
        let opts = GatewayOptions {
            credentials: None,
            heartbeat_interval_ms: 5000,
            auto_reconnect: false,
            max_reconnect_attempts: Some(5),
            initial_reconnect_delay_ms: 500,
            max_reconnect_delay_ms: 60000,
        };
        assert_eq!(opts.heartbeat_interval_ms, 5000);
        assert!(!opts.auto_reconnect);
        assert_eq!(opts.max_reconnect_attempts, Some(5));
        assert_eq!(opts.initial_reconnect_delay_ms, 500);
        assert_eq!(opts.max_reconnect_delay_ms, 60000);
    }

    #[test]
    fn test_reconnect_delay_exponential_backoff() {
        let initial = 1000;
        let max = 30000;

        assert_eq!(calculate_reconnect_delay(0, initial, max), 1000);
        assert_eq!(calculate_reconnect_delay(1, initial, max), 2000);
        assert_eq!(calculate_reconnect_delay(2, initial, max), 4000);
        assert_eq!(calculate_reconnect_delay(3, initial, max), 8000);
        assert_eq!(calculate_reconnect_delay(4, initial, max), 16000);
    }

    #[test]
    fn test_reconnect_delay_capped_at_max() {
        let initial = 1000;
        let max = 10000;

        assert_eq!(calculate_reconnect_delay(0, initial, max), 1000);
        assert_eq!(calculate_reconnect_delay(3, initial, max), 8000);
        assert_eq!(calculate_reconnect_delay(4, initial, max), 10000);
        assert_eq!(calculate_reconnect_delay(5, initial, max), 10000);
        assert_eq!(calculate_reconnect_delay(10, initial, max), 10000);
    }

    #[test]
    fn test_reconnect_delay_no_overflow() {
        let initial = 1000;
        let max = 30000;

        // Very large attempt number should not panic
        let delay = calculate_reconnect_delay(100, initial, max);
        assert_eq!(delay, max);
    }

    #[test]
    fn test_agent_has_gateway_fields() {
        let agent = ParallaxAgent::new(
            "test-agent",
            "Test Agent",
            vec!["analysis".to_string()],
            HashMap::new(),
        );
        // Verify gateway fields are initialized
        assert!(agent.gateway_shutdown_tx.try_lock().is_ok());
        assert!(agent.gateway_reconnecting.try_lock().is_ok());
    }
}