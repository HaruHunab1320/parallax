use crate::{
    error::{Error, Result},
    generated::parallax::registry::{
        registry_client::RegistryClient, AgentRegistration, GetAgentRequest, ListAgentsRequest,
        RegisterRequest, RenewRequest, WatchRequest,
    },
    types::{Agent, AgentStatus},
};
use futures::{Stream, StreamExt};
use std::pin::Pin;
use tonic::transport::Channel;
use tracing::{debug, info};

/// Service for agent operations
#[derive(Clone)]
pub struct AgentService {
    _channel: Channel,
}

impl AgentService {
    pub(crate) fn new(channel: Channel) -> Self {
        Self { _channel: channel }
    }

    /// Register a new agent
    pub async fn register(&self, mut agent: Agent) -> Result<Agent> {
        info!("Registering agent: {}", agent.name);
        
        // Ensure agent has an ID
        if agent.id.is_empty() {
            agent.id = uuid::Uuid::new_v4().to_string();
        }
        
        // Update last seen
        agent.last_seen = chrono::Utc::now();
        
        let metadata = agent.metadata.clone();
        let request = RegisterRequest {
            agent: Some(AgentRegistration {
                id: agent.id.clone(),
                name: agent.name.clone(),
                endpoint: agent.endpoint.clone(),
                capabilities: agent.capabilities.clone(),
                metadata: Some(crate::generated::parallax::registry::agent_registration::Metadata {
                    version: metadata.get("version").cloned().unwrap_or_default(),
                    region: metadata.get("region").cloned().unwrap_or_default(),
                    labels: metadata,
                    default_confidence: agent.confidence,
                }),
                registered_at: None,
                ttl: None,
            }),
            auto_renew: true,
        };

        let mut client = RegistryClient::new(self._channel.clone());
        client.register(request).await?;

        Ok(agent)
    }

    /// List all agents
    pub async fn list(&self) -> Result<Vec<Agent>> {
        debug!("Listing agents");

        let mut client = RegistryClient::new(self._channel.clone());
        let response = client
            .list_agents(ListAgentsRequest {
                capabilities: vec![],
                labels: Default::default(),
                limit: 0,
                continuation_token: String::new(),
            })
            .await?
            .into_inner();

        Ok(response
            .agents
            .into_iter()
            .map(agent_from_registration)
            .collect())
    }

    /// Get a specific agent
    pub async fn get(&self, id: &str) -> Result<Agent> {
        debug!("Getting agent: {}", id);
        
        let agents = self.list().await?;
        agents
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| crate::error::Error::NotFound(format!("Agent not found: {}", id)))
    }

    /// Update agent status
    pub async fn update_status(&self, id: &str, status: AgentStatus) -> Result<()> {
        info!("Updating agent status: {} -> {:?}", id, status);

        Err(Error::InvalidArgument(format!(
            "update status is not supported by the registry API: {}",
            id
        )))
    }

    /// Update agent confidence
    pub async fn update_confidence(&self, id: &str, confidence: f64) -> Result<()> {
        debug!("Updating agent confidence: {} -> {}", id, confidence);
        
        if !(0.0..=1.0).contains(&confidence) {
            return Err(crate::error::Error::InvalidArgument(
                "Confidence must be between 0 and 1".to_string(),
            ));
        }
        

        Err(Error::InvalidArgument(format!(
            "update confidence is not supported by the registry API: {}",
            id
        )))
    }

    /// Send heartbeat for an agent
    pub async fn heartbeat(&self, id: &str) -> Result<()> {
        debug!("Sending heartbeat for agent: {}", id);

        let mut client = RegistryClient::new(self._channel.clone());
        client
            .renew(RenewRequest {
                lease_id: format!("lease-{}", id),
                ttl: None,
            })
            .await?;
        Ok(())
    }

    /// Unregister an agent
    pub async fn unregister(&self, id: &str) -> Result<()> {
        info!("Unregistering agent: {}", id);

        let mut client = RegistryClient::new(self._channel.clone());
        client
            .unregister(AgentRegistration {
                id: id.to_string(),
                name: String::new(),
                endpoint: String::new(),
                capabilities: Vec::new(),
                metadata: None,
                registered_at: None,
                ttl: None,
            })
            .await?;

        Ok(())
    }

    /// Stream agent updates
    pub async fn stream_agents(&self) -> Result<Pin<Box<dyn Stream<Item = Result<Agent>> + Send>>> {
        debug!("Streaming agents");

        let mut client = RegistryClient::new(self._channel.clone());
        let stream = client
            .watch(WatchRequest {
                capabilities: vec![],
                include_initial: true,
            })
            .await?
            .into_inner();

        let mapped = stream.filter_map(|event| async move {
            match event {
                Ok(event) => event.agent.map(|agent| Ok(agent_from_registration(agent))),
                Err(error) => Some(Err(Error::from(error))),
            }
        });

        Ok(Box::pin(mapped))
    }
}

fn agent_from_registration(agent: AgentRegistration) -> Agent {
    let metadata = agent
        .metadata
        .as_ref()
        .map(|metadata| metadata.labels.clone())
        .unwrap_or_default();
    let confidence = agent
        .metadata
        .as_ref()
        .map(|metadata| metadata.default_confidence)
        .unwrap_or(0.0);

    Agent {
        id: agent.id,
        name: agent.name,
        status: AgentStatus::Active,
        capabilities: agent.capabilities,
        endpoint: agent.endpoint,
        last_seen: chrono::Utc::now(),
        confidence,
        metadata,
    }
}
