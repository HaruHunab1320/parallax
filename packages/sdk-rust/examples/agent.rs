use parallax_sdk::{Agent, AgentStatus, Client};
use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};
use tracing_subscriber;

/// Example agent implementation
struct ExampleAgent {
    client: Client,
    agent_info: Agent,
    shutdown: tokio::sync::watch::Receiver<bool>,
}

impl ExampleAgent {
    async fn new(endpoint: &str) -> anyhow::Result<(Self, tokio::sync::watch::Sender<bool>)> {
        // Create client
        let client = Client::connect(endpoint).await?;

        // Create agent info
        let agent_info = Agent::new("Rust Example Agent", vec![
            "example".to_string(),
            "processing".to_string(),
            "rust".to_string(),
        ])
        .with_endpoint("localhost:50100")
        .with_metadata("language", "rust")
        .with_metadata("version", "1.0.0")
        .with_metadata("sdk", "parallax-rust");

        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        Ok((
            Self {
                client,
                agent_info,
                shutdown: shutdown_rx,
            },
            shutdown_tx,
        ))
    }

    async fn start(&mut self) -> anyhow::Result<()> {
        // Register agent
        self.agent_info = self.client.agents().register(self.agent_info.clone()).await?;
        
        info!(
            "Agent registered successfully: {} ({})",
            self.agent_info.name, self.agent_info.id
        );

        // Start background tasks
        let heartbeat_handle = self.spawn_heartbeat_task();
        let confidence_handle = self.spawn_confidence_task();
        let work_handle = self.spawn_work_task();

        // Wait for all tasks
        tokio::select! {
            _ = heartbeat_handle => info!("Heartbeat task completed"),
            _ = confidence_handle => info!("Confidence task completed"),
            _ = work_handle => info!("Work task completed"),
        }

        Ok(())
    }

    async fn stop(&self) -> anyhow::Result<()> {
        // Unregister agent
        self.client.agents().unregister(&self.agent_info.id).await?;
        info!("Agent unregistered successfully");
        Ok(())
    }

    fn spawn_heartbeat_task(&self) -> tokio::task::JoinHandle<()> {
        let client = self.client.clone();
        let agent_id = self.agent_info.id.clone();
        let mut shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(30));
            
            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        if let Err(e) = client.agents().heartbeat(&agent_id).await {
                            error!("Failed to send heartbeat: {}", e);
                        } else {
                            info!("Heartbeat sent");
                        }
                    }
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            info!("Heartbeat task shutting down");
                            break;
                        }
                    }
                }
            }
        })
    }

    fn spawn_confidence_task(&self) -> tokio::task::JoinHandle<()> {
        let client = self.client.clone();
        let agent_id = self.agent_info.id.clone();
        let mut shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(10));
            
            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        // Simulate confidence fluctuation
                        let confidence = 0.7 + rand::random::<f64>() * 0.3;
                        
                        if let Err(e) = client.agents().update_confidence(&agent_id, confidence).await {
                            error!("Failed to update confidence: {}", e);
                        } else {
                            info!("Confidence updated: {:.2}", confidence);
                        }
                    }
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            info!("Confidence task shutting down");
                            break;
                        }
                    }
                }
            }
        })
    }

    fn spawn_work_task(&self) -> tokio::task::JoinHandle<()> {
        let mut shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(15));
            
            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        // Simulate processing work
                        let task_id = format!("task-{}", chrono::Utc::now().timestamp());
                        info!("Processing simulated task: {}", task_id);
                        
                        // Simulate work duration
                        tokio::time::sleep(Duration::from_secs(rand::random::<u64>() % 3 + 1)).await;
                        
                        let accuracy = 0.8 + rand::random::<f64>() * 0.2;
                        info!("Task completed: {} (accuracy: {:.2})", task_id, accuracy);
                    }
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            info!("Work task shutting down");
                            break;
                        }
                    }
                }
            }
        })
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    // Get endpoint from environment or use default
    let endpoint = std::env::var("PARALLAX_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());

    // Create agent
    let (mut agent, shutdown_tx) = ExampleAgent::new(&endpoint).await?;

    // Setup signal handler
    let mut sigterm = tokio::signal::unix::signal(
        tokio::signal::unix::SignalKind::terminate()
    )?;

    // Start agent in background
    let agent_handle = tokio::spawn(async move {
        if let Err(e) = agent.start().await {
            error!("Agent error: {}", e);
        }
        agent
    });

    info!("Agent running. Press Ctrl+C to stop.");

    // Wait for shutdown signal
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Received Ctrl+C");
        }
        _ = sigterm.recv() => {
            info!("Received SIGTERM");
        }
    }

    info!("Shutting down agent...");

    // Signal shutdown
    let _ = shutdown_tx.send(true);

    // Wait for agent to finish
    let agent = agent_handle.await?;
    
    // Stop agent
    if let Err(e) = agent.stop().await {
        error!("Error during shutdown: {}", e);
    }

    info!("Agent stopped");
    Ok(())
}