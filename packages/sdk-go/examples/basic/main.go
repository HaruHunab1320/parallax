package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/parallax/sdk-go/pkg/parallax"
	"go.uber.org/zap"
)

func main() {
	// Create logger
	logger, err := zap.NewDevelopment()
	if err != nil {
		log.Fatal(err)
	}
	defer logger.Sync()

	// Create client
	client, err := parallax.NewClient(parallax.ClientConfig{
		Endpoint:       "localhost:8080",
		Logger:         logger,
		RequestTimeout: 30 * time.Second,
	})
	if err != nil {
		log.Fatal("Failed to create client:", err)
	}
	defer client.Close()

	ctx := context.Background()

	// Example 1: List available patterns
	fmt.Println("\n=== Available Patterns ===")
	patterns, err := client.Patterns().List(ctx)
	if err != nil {
		log.Fatal("Failed to list patterns:", err)
	}

	for _, pattern := range patterns {
		fmt.Printf("- %s: %s\n", pattern.Name, pattern.Description)
		fmt.Printf("  Required capabilities: %v\n", pattern.RequiredCapabilities)
		fmt.Printf("  Enabled: %v\n\n", pattern.Enabled)
	}

	// Example 2: List agents
	fmt.Println("\n=== Registered Agents ===")
	agents, err := client.Agents().List(ctx)
	if err != nil {
		log.Fatal("Failed to list agents:", err)
	}

	for _, agent := range agents {
		fmt.Printf("- %s (%s)\n", agent.Name, agent.ID)
		fmt.Printf("  Status: %s\n", agent.Status)
		fmt.Printf("  Capabilities: %v\n", agent.Capabilities)
		fmt.Printf("  Confidence: %.2f\n", agent.Confidence)
		fmt.Printf("  Last seen: %s\n\n", agent.LastSeen.Format(time.RFC3339))
	}

	// Example 3: Execute a pattern
	fmt.Println("\n=== Executing Pattern ===")
	execution, err := client.Patterns().Execute(ctx, "consensus-builder", 
		map[string]interface{}{
			"task": "Analyze the sentiment of customer feedback",
			"data": []string{
				"The product is amazing!",
				"Could be better",
				"Excellent service",
			},
		},
		&parallax.ExecuteOptions{
			Timeout: 30 * time.Second,
			Metadata: map[string]interface{}{
				"source": "example",
			},
		},
	)
	if err != nil {
		log.Fatal("Failed to execute pattern:", err)
	}

	fmt.Printf("Execution ID: %s\n", execution.ID)
	fmt.Printf("Pattern: %s\n", execution.Pattern)
	fmt.Printf("Status: %s\n", execution.Status)
	fmt.Printf("Agents: %v\n", execution.Agents)
	
	if execution.Status == parallax.ExecutionStatusCompleted {
		fmt.Printf("Output: %v\n", execution.Output)
		fmt.Printf("Confidence: %.2f\n", execution.Confidence)
		fmt.Printf("Duration: %s\n", execution.Duration)
	}

	// Example 4: Register a new agent
	fmt.Println("\n=== Registering New Agent ===")
	newAgent := &parallax.Agent{
		Name:         "Example Agent",
		Capabilities: []string{"example", "demo"},
		Endpoint:     "localhost:50099",
		Metadata: map[string]string{
			"version": "1.0.0",
			"type":    "example",
		},
	}

	err = client.Agents().Register(ctx, newAgent)
	if err != nil {
		log.Fatal("Failed to register agent:", err)
	}
	fmt.Printf("Agent registered successfully: %s\n", newAgent.ID)

	// Example 5: Stream agent updates
	fmt.Println("\n=== Streaming Agent Updates ===")
	streamCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	agentStream, err := client.Agents().StreamAgents(streamCtx)
	if err != nil {
		log.Fatal("Failed to stream agents:", err)
	}

	fmt.Println("Listening for agent updates (30 seconds)...")
	for {
		select {
		case agent, ok := <-agentStream:
			if !ok {
				fmt.Println("Stream closed")
				return
			}
			fmt.Printf("Agent update: %s (%s) - Status: %s, Confidence: %.2f\n",
				agent.Name, agent.ID, agent.Status, agent.Confidence)
		case <-streamCtx.Done():
			fmt.Println("Stream timeout")
			return
		}
	}
}