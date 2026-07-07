use crate::{
    agent_service::AgentService, error::Result, executions::ExecutionService, patterns::PatternService,
};
use std::time::Duration;
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Endpoint, Identity};
use tracing::info;

/// Parallax client for interacting with the control plane
#[derive(Clone)]
pub struct Client {
    channel: Channel,
    endpoint: String,
}

/// Client configuration
#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub endpoint: String,
    pub timeout: Duration,
    pub connect_timeout: Duration,
    pub keep_alive_interval: Duration,
    pub keep_alive_timeout: Duration,
    pub tls_config: Option<TlsConfig>,
}

/// TLS configuration
#[derive(Debug, Clone)]
pub struct TlsConfig {
    pub ca_cert: Vec<u8>,
    pub client_cert: Option<Vec<u8>>,
    pub client_key: Option<Vec<u8>>,
    pub domain_name: Option<String>,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://localhost:8080".to_string(),
            timeout: Duration::from_secs(30),
            connect_timeout: Duration::from_secs(10),
            keep_alive_interval: Duration::from_secs(30),
            keep_alive_timeout: Duration::from_secs(10),
            tls_config: None,
        }
    }
}

impl Client {
    /// Create a new client with the given configuration
    pub async fn new(config: ClientConfig) -> Result<Self> {
        let mut endpoint = Endpoint::from_shared(config.endpoint.clone())?
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .http2_keep_alive_interval(config.keep_alive_interval)
            .keep_alive_timeout(config.keep_alive_timeout);

        // Configure TLS if provided
        if let Some(tls) = config.tls_config {
            let mut tls_config = ClientTlsConfig::new();
            
            if let Some(domain) = tls.domain_name {
                tls_config = tls_config.domain_name(domain);
            }

            if !tls.ca_cert.is_empty() {
                tls_config = tls_config.ca_certificate(Certificate::from_pem(tls.ca_cert));
            }

            if let (Some(cert), Some(key)) = (tls.client_cert, tls.client_key) {
                tls_config = tls_config.identity(Identity::from_pem(cert, key));
            }
            
            endpoint = endpoint.tls_config(tls_config)?;
        }

        let channel = endpoint.connect().await?;
        
        info!("Connected to Parallax control plane at {}", config.endpoint);

        Ok(Self {
            channel,
            endpoint: config.endpoint,
        })
    }

    /// Create a new client with default configuration
    pub async fn connect(endpoint: impl Into<String>) -> Result<Self> {
        let config = ClientConfig {
            endpoint: endpoint.into(),
            ..Default::default()
        };
        Self::new(config).await
    }

    /// Get the pattern service
    pub fn patterns(&self) -> PatternService {
        PatternService::new(self.channel.clone())
    }

    /// Get the agent service
    pub fn agents(&self) -> AgentService {
        AgentService::new(self.channel.clone())
    }

    /// Get the execution service
    pub fn executions(&self) -> ExecutionService {
        ExecutionService::new(self.channel.clone())
    }

    /// Get the endpoint this client is connected to
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    /// Check if the control plane is healthy
    pub async fn health_check(&self) -> Result<bool> {
        let patterns = PatternService::new(self.channel.clone());
        let result = patterns.list().await;
        Ok(result.is_ok())
    }
}
