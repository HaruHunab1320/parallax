package parallax

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	confidence "github.com/parallax/sdk-go/generated"
	registry "github.com/parallax/sdk-go/generated"
)

// Agent defines the interface that all Parallax agents must implement
type Agent interface {
	// GetID returns the agent's unique identifier
	GetID() string

	// GetName returns the agent's human-readable name
	GetName() string

	// GetCapabilities returns the agent's capabilities
	GetCapabilities() []string

	// GetMetadata returns optional agent metadata
	GetMetadata() map[string]string

	// Analyze performs the agent's main analysis task
	Analyze(ctx context.Context, task string, data interface{}) (*AnalyzeResult, error)

	// CheckHealth returns the agent's health status
	CheckHealth(ctx context.Context) (*HealthStatus, error)
}

// AnalyzeResult represents the result of an agent's analysis
type AnalyzeResult struct {
	Value         interface{}
	Confidence    float64
	Reasoning     string
	Uncertainties []string
	Metadata      map[string]string
}

// HealthStatus represents an agent's health
type HealthStatus struct {
	Status  string // "healthy", "degraded", "unhealthy"
	Message string
}

// GrpcAgent wraps an Agent with gRPC server capabilities
type GrpcAgent struct {
	confidence.UnimplementedConfidenceAgentServer
	
	agent        Agent
	server       *grpc.Server
	port         int
	registryAddr string
	leaseID      string
	stopCh       chan struct{}
	wg           sync.WaitGroup
	mu           sync.Mutex
}

// NewGrpcAgent creates a new gRPC-enabled agent
func NewGrpcAgent(agent Agent) *GrpcAgent {
	registryAddr := os.Getenv("PARALLAX_REGISTRY")
	if registryAddr == "" {
		registryAddr = "localhost:50051"
	}

	return &GrpcAgent{
		agent:        agent,
		registryAddr: registryAddr,
		stopCh:       make(chan struct{}),
	}
}

// Serve starts the gRPC server and registers with the control plane
func (g *GrpcAgent) Serve(port int) error {
	// Create gRPC server
	g.server = grpc.NewServer()
	confidence.RegisterConfidenceAgentServer(g.server, g)

	// Listen on port
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	// Get actual port
	g.port = lis.Addr().(*net.TCPAddr).Port
	log.Printf("Agent %s (%s) listening on port %d", g.agent.GetName(), g.agent.GetID(), g.port)

	// Start server in goroutine
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		if err := g.server.Serve(lis); err != nil {
			log.Printf("Failed to serve: %v", err)
		}
	}()

	// Register with control plane
	if err := g.register(); err != nil {
		log.Printf("Failed to register with control plane: %v", err)
		// Continue running even if registration fails
	}

	return nil
}

// Stop gracefully shuts down the agent
func (g *GrpcAgent) Stop() error {
	close(g.stopCh)

	// Unregister from control plane
	if err := g.unregister(); err != nil {
		log.Printf("Failed to unregister: %v", err)
	}

	// Stop gRPC server
	g.server.GracefulStop()
	
	// Wait for goroutines
	g.wg.Wait()

	return nil
}

// register registers the agent with the control plane
func (g *GrpcAgent) register() error {
	conn, err := grpc.NewClient(g.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to connect to registry: %w", err)
	}
	defer conn.Close()

	client := registry.NewRegistryClient(conn)
	
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req := &registry.RegisterRequest{
		Agent: &registry.Agent{
			Id:           g.agent.GetID(),
			Name:         g.agent.GetName(),
			Address:      fmt.Sprintf("localhost:%d", g.port),
			Capabilities: g.agent.GetCapabilities(),
			Metadata:     g.agent.GetMetadata(),
			Status:       registry.Agent_HEALTHY,
		},
	}

	resp, err := client.Register(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}

	g.mu.Lock()
	g.leaseID = resp.Registration.LeaseId
	g.mu.Unlock()

	log.Printf("Agent %s registered with control plane, lease_id: %s", g.agent.GetID(), g.leaseID)

	// Start lease renewal
	g.wg.Add(1)
	go g.renewLeaseLoop()

	return nil
}

// renewLeaseLoop periodically renews the agent's lease
func (g *GrpcAgent) renewLeaseLoop() {
	defer g.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	conn, err := grpc.NewClient(g.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("Failed to connect for lease renewal: %v", err)
		return
	}
	defer conn.Close()

	client := registry.NewRegistryClient(conn)

	for {
		select {
		case <-g.stopCh:
			return
		case <-ticker.C:
			g.mu.Lock()
			leaseID := g.leaseID
			g.mu.Unlock()

			if leaseID == "" {
				continue
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			req := &registry.RenewRequest{LeaseId: leaseID}
			
			resp, err := client.Renew(ctx, req)
			cancel()

			if err != nil {
				log.Printf("Failed to renew lease: %v", err)
				continue
			}

			if !resp.Renewed {
				log.Printf("Lease renewal failed")
				// Try to re-register
				if err := g.register(); err != nil {
					log.Printf("Failed to re-register: %v", err)
				}
			}
		}
	}
}

// unregister removes the agent from the control plane
func (g *GrpcAgent) unregister() error {
	g.mu.Lock()
	if g.leaseID == "" {
		g.mu.Unlock()
		return nil
	}
	g.mu.Unlock()

	conn, err := grpc.NewClient(g.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to connect to registry: %w", err)
	}
	defer conn.Close()

	client := registry.NewRegistryClient(conn)
	
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req := &registry.UnregisterRequest{AgentId: g.agent.GetID()}
	
	_, err = client.Unregister(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to unregister: %w", err)
	}

	log.Printf("Agent %s unregistered from control plane", g.agent.GetID())
	return nil
}

// Execute implements the ConfidenceAgent.Execute RPC
func (g *GrpcAgent) Execute(ctx context.Context, req *confidence.ExecuteRequest) (*confidence.ExecuteResponse, error) {
	task := req.GetTask()
	if task == nil {
		return nil, status.Error(grpc.codes.InvalidArgument, "task is required")
	}

	// Parse task data if provided
	var data interface{}
	if task.Data != "" {
		if err := json.Unmarshal([]byte(task.Data), &data); err != nil {
			return nil, status.Errorf(grpc.codes.InvalidArgument, "invalid task data: %v", err)
		}
	}

	// Call agent's analyze method
	result, err := g.agent.Analyze(ctx, task.Description, data)
	if err != nil {
		return nil, status.Errorf(grpc.codes.Internal, "analysis failed: %v", err)
	}

	// Marshal result value
	valueJSON, err := json.Marshal(result.Value)
	if err != nil {
		return nil, status.Errorf(grpc.codes.Internal, "failed to marshal result: %v", err)
	}

	// Build response
	resp := &confidence.ExecuteResponse{
		Result: &confidence.ConfidenceResult{
			ValueJson:     string(valueJSON),
			Confidence:    result.Confidence,
			AgentId:       g.agent.GetID(),
			Timestamp:     timestamppb.Now(),
			Reasoning:     result.Reasoning,
			Uncertainties: result.Uncertainties,
			Metadata:      result.Metadata,
		},
	}

	return resp, nil
}

// StreamExecute implements the ConfidenceAgent.StreamExecute RPC
func (g *GrpcAgent) StreamExecute(req *confidence.ExecuteRequest, stream confidence.ConfidenceAgent_StreamExecuteServer) error {
	// For now, just execute once and send result
	// TODO: Implement proper streaming
	
	resp, err := g.Execute(stream.Context(), req)
	if err != nil {
		return err
	}

	return stream.Send(resp)
}

// GetCapabilities implements the ConfidenceAgent.GetCapabilities RPC
func (g *GrpcAgent) GetCapabilities(ctx context.Context, req *emptypb.Empty) (*confidence.GetCapabilitiesResponse, error) {
	return &confidence.GetCapabilitiesResponse{
		Capabilities:   g.agent.GetCapabilities(),
		ExpertiseLevel: confidence.GetCapabilitiesResponse_EXPERT,
	}, nil
}

// HealthCheck implements the ConfidenceAgent.HealthCheck RPC
func (g *GrpcAgent) HealthCheck(ctx context.Context, req *emptypb.Empty) (*confidence.HealthCheckResponse, error) {
	health, err := g.agent.CheckHealth(ctx)
	if err != nil {
		return nil, status.Errorf(grpc.codes.Internal, "health check failed: %v", err)
	}

	// Map status string to enum
	var pbStatus confidence.HealthCheckResponse_Status
	switch health.Status {
	case "healthy":
		pbStatus = confidence.HealthCheckResponse_HEALTHY
	case "degraded":
		pbStatus = confidence.HealthCheckResponse_DEGRADED
	default:
		pbStatus = confidence.HealthCheckResponse_UNHEALTHY
	}

	return &confidence.HealthCheckResponse{
		Status:  pbStatus,
		Message: health.Message,
	}, nil
}

// ServeAgent is a convenience function to serve an agent
func ServeAgent(agent Agent, port int) error {
	grpcAgent := NewGrpcAgent(agent)
	
	if err := grpcAgent.Serve(port); err != nil {
		return err
	}

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	
	<-sigCh
	log.Println("Shutting down agent...")
	
	return grpcAgent.Stop()
}