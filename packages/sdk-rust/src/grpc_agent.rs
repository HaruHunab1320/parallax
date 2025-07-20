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
    Agent as ProtoAgent, ConfidenceResult, ExecuteRequest, ExecuteResponse,
    GetCapabilitiesResponse, HealthCheckResponse, RegisterRequest, RenewRequest,
    UnregisterRequest,
};

/// Trait that all Parallax agents must implement
#[async_trait]
pub trait Agent: Send + Sync + 'static {
    /// Get the agent's unique identifier
    fn get_id(&self) -> &str;

    /// Get the agent's human-readable name
    fn get_name(&self) -> &str;

    /// Get the agent's capabilities
    fn get_capabilities(&self) -> &[String];

    /// Get optional agent metadata
    fn get_metadata(&self) -> HashMap<String, String> {
        HashMap::new()
    }

    /// Perform the agent's main analysis task
    async fn analyze(
        &self,
        task: &str,
        data: Option<serde_json::Value>,
    ) -> Result<AnalyzeResult, Box<dyn std::error::Error>>;

    /// Check the agent's health
    async fn check_health(&self) -> Result<HealthStatus, Box<dyn std::error::Error>> {
        Ok(HealthStatus {
            status: "healthy".to_string(),
            message: Some("Agent is operational".to_string()),
        })
    }
}

/// Result of an agent's analysis
pub struct AnalyzeResult {
    pub value: serde_json::Value,
    pub confidence: f64,
    pub reasoning: Option<String>,
    pub uncertainties: Vec<String>,
    pub metadata: HashMap<String, String>,
}

/// Health status of an agent
pub struct HealthStatus {
    pub status: String, // "healthy", "degraded", "unhealthy"
    pub message: Option<String>,
}

/// gRPC-enabled agent wrapper
pub struct GrpcAgent<A: Agent> {
    agent: Arc<A>,
    port: u16,
    registry_addr: String,
    lease_id: Arc<Mutex<Option<String>>>,
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl<A: Agent> GrpcAgent<A> {
    /// Create a new gRPC-enabled agent
    pub fn new(agent: A) -> Self {
        let registry_addr = std::env::var("PARALLAX_REGISTRY")
            .unwrap_or_else(|_| "http://localhost:50051".to_string());

        Self {
            agent: Arc::new(agent),
            port: 0,
            registry_addr,
            lease_id: Arc::new(Mutex::new(None)),
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Serve the agent on the specified port
    pub async fn serve(mut self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        // Create gRPC service
        let service = GrpcAgentService {
            agent: self.agent.clone(),
        };

        // Build server
        let addr = format!("0.0.0.0:{}", port).parse::<SocketAddr>()?;
        let server = Server::builder()
            .add_service(ConfidenceAgentServer::new(service))
            .serve(addr);

        // Get actual address
        let actual_addr = server.local_addr();
        self.port = actual_addr.port();

        info!(
            "Agent {} ({}) listening on {}",
            self.agent.get_name(),
            self.agent.get_id(),
            actual_addr
        );

        // Register with control plane
        if let Err(e) = self.register().await {
            error!("Failed to register with control plane: {}", e);
            // Continue running even if registration fails
        }

        // Start lease renewal
        let agent_clone = self.agent.clone();
        let lease_id_clone = self.lease_id.clone();
        let registry_addr = self.registry_addr.clone();
        tokio::spawn(async move {
            renew_lease_loop(agent_clone, lease_id_clone, registry_addr).await;
        });

        // Setup shutdown handler
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        *self.shutdown_tx.lock().await = Some(shutdown_tx);

        // Wait for shutdown signal
        let graceful = server.with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });

        // Run server
        graceful.await?;

        // Unregister on shutdown
        if let Err(e) = self.unregister().await {
            error!("Failed to unregister: {}", e);
        }

        Ok(())
    }

    /// Register with the control plane
    async fn register(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut client = RegistryClient::connect(self.registry_addr.clone()).await?;

        let request = RegisterRequest {
            agent: Some(ProtoAgent {
                id: self.agent.get_id().to_string(),
                name: self.agent.get_name().to_string(),
                address: format!("localhost:{}", self.port),
                capabilities: self.agent.get_capabilities().to_vec(),
                metadata: self.agent.get_metadata(),
                status: 1, // HEALTHY
                last_seen: None,
            }),
        };

        let response = client.register(request).await?;
        let registration = response.into_inner().registration.unwrap();
        
        *self.lease_id.lock().await = Some(registration.lease_id);

        info!(
            "Agent {} registered with control plane",
            self.agent.get_id()
        );

        Ok(())
    }

    /// Unregister from the control plane
    async fn unregister(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut client = RegistryClient::connect(self.registry_addr.clone()).await?;

        let request = UnregisterRequest {
            agent_id: self.agent.get_id().to_string(),
        };

        client.unregister(request).await?;

        info!(
            "Agent {} unregistered from control plane",
            self.agent.get_id()
        );

        Ok(())
    }

    /// Stop the agent gracefully
    pub async fn stop(self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }
        Ok(())
    }
}

/// Internal gRPC service implementation
struct GrpcAgentService<A: Agent> {
    agent: Arc<A>,
}

#[async_trait]
impl<A: Agent> ConfidenceAgent for GrpcAgentService<A> {
    async fn execute(
        &self,
        request: Request<ExecuteRequest>,
    ) -> Result<Response<ExecuteResponse>, Status> {
        let req = request.into_inner();
        let task = req.task.ok_or_else(|| Status::invalid_argument("task is required"))?;

        // Parse task data if provided
        let data = if task.data.is_empty() {
            None
        } else {
            Some(serde_json::from_str(&task.data).map_err(|e| {
                Status::invalid_argument(format!("invalid task data: {}", e))
            })?)
        };

        // Call agent's analyze method
        let result = self
            .agent
            .analyze(&task.description, data)
            .await
            .map_err(|e| Status::internal(format!("analysis failed: {}", e)))?;

        // Build response
        let response = ExecuteResponse {
            result: Some(ConfidenceResult {
                value_json: serde_json::to_string(&result.value).unwrap(),
                confidence: result.confidence,
                agent_id: self.agent.get_id().to_string(),
                timestamp: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                reasoning: result.reasoning.unwrap_or_default(),
                uncertainties: result.uncertainties,
                metadata: result.metadata,
            }),
            error: None,
        };

        Ok(Response::new(response))
    }

    type StreamExecuteStream = tokio_stream::wrappers::ReceiverStream<Result<ExecuteResponse, Status>>;

    async fn stream_execute(
        &self,
        request: Request<ExecuteRequest>,
    ) -> Result<Response<Self::StreamExecuteStream>, Status> {
        // For now, just execute once and return
        // TODO: Implement proper streaming
        let (tx, rx) = tokio::sync::mpsc::channel(1);

        let response = self.execute(request).await?;
        let _ = tx.send(Ok(response.into_inner())).await;

        Ok(Response::new(tokio_stream::wrappers::ReceiverStream::new(rx)))
    }

    async fn get_capabilities(
        &self,
        _request: Request<()>,
    ) -> Result<Response<GetCapabilitiesResponse>, Status> {
        let response = GetCapabilitiesResponse {
            capabilities: self.agent.get_capabilities().to_vec(),
            expertise_level: 3, // EXPERT
            capability_scores: HashMap::new(),
        };

        Ok(Response::new(response))
    }

    async fn health_check(
        &self,
        _request: Request<()>,
    ) -> Result<Response<HealthCheckResponse>, Status> {
        let health = self
            .agent
            .check_health()
            .await
            .map_err(|e| Status::internal(format!("health check failed: {}", e)))?;

        let status = match health.status.as_str() {
            "healthy" => 1,   // HEALTHY
            "degraded" => 2,  // DEGRADED
            _ => 3,           // UNHEALTHY
        };

        let response = HealthCheckResponse {
            status,
            message: health.message.unwrap_or_default(),
        };

        Ok(Response::new(response))
    }
}

/// Lease renewal loop
async fn renew_lease_loop<A: Agent>(
    agent: Arc<A>,
    lease_id: Arc<Mutex<Option<String>>>,
    registry_addr: String,
) {
    let mut interval = interval(Duration::from_secs(30));

    loop {
        interval.tick().await;

        let lease = lease_id.lock().await.clone();
        if let Some(id) = lease {
            match renew_lease(&registry_addr, &id).await {
                Ok(renewed) => {
                    if !renewed {
                        warn!("Lease renewal failed, attempting to re-register");
                        // TODO: Re-register
                    }
                }
                Err(e) => {
                    error!("Failed to renew lease: {}", e);
                }
            }
        }
    }
}

/// Renew a lease with the registry
async fn renew_lease(
    registry_addr: &str,
    lease_id: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let mut client = RegistryClient::connect(registry_addr.to_string()).await?;

    let request = RenewRequest {
        lease_id: lease_id.to_string(),
    };

    let response = client.renew(request).await?;
    Ok(response.into_inner().renewed)
}

/// Serve an agent with graceful shutdown
pub async fn serve_agent<A: Agent>(agent: A, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let grpc_agent = GrpcAgent::new(agent);

    // Setup signal handler
    let grpc_agent_clone = Arc::new(tokio::sync::Mutex::new(Some(grpc_agent)));
    let grpc_agent_signal = grpc_agent_clone.clone();

    tokio::spawn(async move {
        signal::ctrl_c().await.expect("Failed to listen for ctrl-c");
        info!("Shutting down agent...");
        
        if let Some(agent) = grpc_agent_signal.lock().await.take() {
            let _ = agent.stop().await;
        }
    });

    // Serve the agent
    if let Some(agent) = grpc_agent_clone.lock().await.take() {
        agent.serve(port).await?;
    }

    Ok(())
}