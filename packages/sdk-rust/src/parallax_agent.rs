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

/// Result of an agent's analysis
#[derive(Debug, Clone)]
pub struct AgentResult {
    pub value: serde_json::Value,
    pub confidence: f64,
    pub reasoning: Option<String>,
    pub uncertainties: Vec<String>,
    pub metadata: HashMap<String, String>,
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
    
    /// Shutdown the agent
    pub async fn shutdown(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!(agent_id = %self.id, "Shutting down agent");
        
        // Unregister from control plane
        // Note: In a real implementation, we'd have an unregister method in the Registry service
        
        // Trigger shutdown
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