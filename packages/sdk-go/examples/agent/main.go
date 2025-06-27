package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/parallax/sdk-go/pkg/parallax"
	"go.uber.org/zap"
)

// ExampleAgent demonstrates how to implement an agent using the Go SDK
type ExampleAgent struct {
	client      *parallax.Client
	agentInfo   *parallax.Agent
	logger      *zap.Logger
	stopCh      chan struct{}
}

func NewExampleAgent(endpoint string, logger *zap.Logger) (*ExampleAgent, error) {
	// Create Parallax client
	client, err := parallax.NewClient(parallax.ClientConfig{
		Endpoint: endpoint,
		Logger:   logger,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}

	// Define agent information
	agentInfo := &parallax.Agent{
		Name:         "Go Example Agent",
		Capabilities: []string{"example", "processing", "golang"},
		Endpoint:     "localhost:50100",
		Metadata: map[string]string{
			"language": "go",
			"version":  "1.0.0",
			"sdk":      "parallax-go",
		},
	}

	return &ExampleAgent{
		client:    client,
		agentInfo: agentInfo,
		logger:    logger,
		stopCh:    make(chan struct{}),
	}, nil
}

// Start registers the agent and begins operation
func (a *ExampleAgent) Start(ctx context.Context) error {
	// Register agent
	if err := a.client.Agents().Register(ctx, a.agentInfo); err != nil {
		return fmt.Errorf("failed to register agent: %w", err)
	}

	a.logger.Info("Agent registered successfully",
		zap.String("id", a.agentInfo.ID),
		zap.String("name", a.agentInfo.Name),
	)

	// Start heartbeat routine
	go a.heartbeatLoop(ctx)

	// Start confidence update routine
	go a.confidenceUpdateLoop(ctx)

	// Start work simulation
	go a.workLoop(ctx)

	return nil
}

// Stop gracefully shuts down the agent
func (a *ExampleAgent) Stop(ctx context.Context) error {
	close(a.stopCh)

	// Unregister agent
	if err := a.client.Agents().Unregister(ctx, a.agentInfo.ID); err != nil {
		a.logger.Error("Failed to unregister agent", zap.Error(err))
		return err
	}

	a.logger.Info("Agent unregistered successfully")
	return a.client.Close()
}

// heartbeatLoop sends periodic heartbeats
func (a *ExampleAgent) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			if err := a.client.Agents().Heartbeat(ctx, a.agentInfo.ID); err != nil {
				a.logger.Error("Failed to send heartbeat", zap.Error(err))
			} else {
				a.logger.Debug("Heartbeat sent")
			}
		}
	}
}

// confidenceUpdateLoop updates confidence based on simulated performance
func (a *ExampleAgent) confidenceUpdateLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			// Simulate confidence fluctuation
			confidence := 0.7 + rand.Float64()*0.3
			if err := a.client.Agents().UpdateConfidence(ctx, a.agentInfo.ID, confidence); err != nil {
				a.logger.Error("Failed to update confidence", zap.Error(err))
			} else {
				a.logger.Info("Confidence updated", zap.Float64("confidence", confidence))
			}
		}
	}
}

// workLoop simulates agent doing work
func (a *ExampleAgent) workLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			// Simulate processing work
			a.logger.Info("Processing simulated task",
				zap.String("task", fmt.Sprintf("task-%d", time.Now().Unix())),
			)

			// Simulate work duration
			time.Sleep(time.Duration(rand.Intn(3)+1) * time.Second)

			// Log completion
			a.logger.Info("Task completed",
				zap.Float64("accuracy", 0.8+rand.Float64()*0.2),
			)
		}
	}
}

func main() {
	// Create logger
	logger, err := zap.NewDevelopment()
	if err != nil {
		log.Fatal(err)
	}
	defer logger.Sync()

	// Get control plane endpoint from environment or use default
	endpoint := os.Getenv("PARALLAX_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:8080"
	}

	// Create agent
	agent, err := NewExampleAgent(endpoint, logger)
	if err != nil {
		logger.Fatal("Failed to create agent", zap.Error(err))
	}

	// Create context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start agent
	if err := agent.Start(ctx); err != nil {
		logger.Fatal("Failed to start agent", zap.Error(err))
	}

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	logger.Info("Agent running. Press Ctrl+C to stop.")

	<-sigCh
	logger.Info("Shutting down agent...")

	// Graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := agent.Stop(shutdownCtx); err != nil {
		logger.Error("Error during shutdown", zap.Error(err))
	}

	logger.Info("Agent stopped")
}