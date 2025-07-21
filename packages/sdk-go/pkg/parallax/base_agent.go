package parallax

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"parallax/sdk-go/generated"
)

// AgentResult represents the result of an agent's analysis
type AgentResult struct {
	Value         interface{}
	Confidence    float64
	Reasoning     string
	Uncertainties []string
	Metadata      map[string]string
}

// ParallaxAgent is the base class for all Parallax agents in Go
type ParallaxAgent struct {
	ID           string
	Name         string
	Capabilities []string
	Metadata     map[string]interface{}
	
	server       *grpc.Server
	port         int
	registryAddr string
	leaseID      string
	renewStop    chan bool
	mu           sync.Mutex
	
	// Abstract method that must be implemented by subclasses
	AnalyzeFunc func(ctx context.Context, task string, data interface{}) (*AgentResult, error)
}

// NewParallaxAgent creates a new ParallaxAgent
func NewParallaxAgent(id, name string, capabilities []string, metadata map[string]interface{}) *ParallaxAgent {
	return &ParallaxAgent{
		ID:           id,
		Name:         name,
		Capabilities: capabilities,
		Metadata:     metadata,
		registryAddr: getEnvOrDefault("PARALLAX_REGISTRY", "localhost:50051"),
		renewStop:    make(chan bool),
	}
}

// Serve starts the gRPC server and registers with the control plane
func (a *ParallaxAgent) Serve(port int) error {
	a.server = grpc.NewServer()
	a.port = port
	
	// Register the ConfidenceAgent service
	generated.RegisterConfidenceAgentServer(a.server, a)
	
	// Start listening
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	
	// Get the actual port if 0 was specified
	if port == 0 {
		a.port = lis.Addr().(*net.TCPAddr).Port
	}
	
	log.Printf("Agent %s (%s) listening on port %d", a.Name, a.ID, a.port)
	
	// Register with control plane
	if err := a.register(); err != nil {
		log.Printf("Failed to register with control plane: %v", err)
		// Continue anyway - agent can work without registration
	}
	
	// Handle graceful shutdown
	go a.handleShutdown()
	
	// Start serving
	return a.server.Serve(lis)
}

// Analyze implements the gRPC ConfidenceAgent.Analyze method
func (a *ParallaxAgent) Analyze(ctx context.Context, req *generated.AgentRequest) (*generated.ConfidenceResult, error) {
	if req.TaskDescription == "" {
		return nil, status.Error(codes.InvalidArgument, "task description is required")
	}
	
	// Parse data if provided
	var data interface{}
	if req.Data != nil {
		data = req.Data.AsMap()
	}
	
	// Call the implementation's analyze function
	if a.AnalyzeFunc == nil {
		return nil, status.Error(codes.Unimplemented, "analyze function not implemented")
	}
	
	result, err := a.AnalyzeFunc(ctx, req.TaskDescription, data)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "analysis failed: %v", err)
	}
	
	// Convert to protobuf response
	return &generated.ConfidenceResult{
		ValueJson:     mustMarshalJSON(result.Value),
		Confidence:    result.Confidence,
		AgentId:       a.ID,
		Timestamp:     timestamppb.Now(),
		Reasoning:     result.Reasoning,
		Uncertainties: result.Uncertainties,
		Metadata:      result.Metadata,
	}, nil
}

// StreamAnalyze implements the gRPC ConfidenceAgent.StreamAnalyze method
func (a *ParallaxAgent) StreamAnalyze(req *generated.AgentRequest, stream grpc.ServerStreamingServer[generated.ConfidenceResult]) error {
	// For now, just analyze once and send result
	resp, err := a.Analyze(stream.Context(), req)
	if err != nil {
		return err
	}
	return stream.Send(resp)
}

// GetCapabilities implements the gRPC ConfidenceAgent.GetCapabilities method
func (a *ParallaxAgent) GetCapabilities(ctx context.Context, req *emptypb.Empty) (*generated.Capabilities, error) {
	return &generated.Capabilities{
		Capabilities: a.Capabilities,
	}, nil
}

// HealthCheck implements the gRPC ConfidenceAgent.HealthCheck method
func (a *ParallaxAgent) HealthCheck(ctx context.Context, req *emptypb.Empty) (*generated.Health, error) {
	return &generated.Health{
		Status:  generated.Health_HEALTHY,
		Message: "Agent is operational",
	}, nil
}

// register registers the agent with the control plane
func (a *ParallaxAgent) register() error {
	conn, err := grpc.NewClient(a.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to connect to registry: %w", err)
	}
	defer conn.Close()
	
	client := generated.NewRegistryClient(conn)
	
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	req := &generated.RegisterRequest{
		Agent: &generated.AgentRegistration{
			Id:           a.ID,
			Name:         a.Name,
			Endpoint:     fmt.Sprintf("localhost:%d", a.port),
			Capabilities: a.Capabilities,
		},
	}
	
	resp, err := client.Register(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}
	
	a.mu.Lock()
	a.leaseID = resp.LeaseId
	a.mu.Unlock()
	
	log.Printf("Agent %s registered with control plane, lease_id: %s", a.ID, a.leaseID)
	
	// Start lease renewal
	go a.renewLease()
	
	return nil
}

// renewLease periodically renews the agent's lease
func (a *ParallaxAgent) renewLease() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			a.mu.Lock()
			leaseID := a.leaseID
			a.mu.Unlock()
			
			if leaseID == "" {
				continue
			}
			
			conn, err := grpc.NewClient(a.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				log.Printf("Failed to connect for lease renewal: %v", err)
				continue
			}
			
			client := generated.NewRegistryClient(conn)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			
			resp, err := client.Renew(ctx, &generated.RenewRequest{LeaseId: leaseID})
			conn.Close()
			cancel()
			
			if err != nil {
				log.Printf("Failed to renew lease: %v", err)
				continue
			}
			
			if !resp.Success {
				log.Printf("Lease renewal failed")
				// Try to re-register
				if err := a.register(); err != nil {
					log.Printf("Failed to re-register: %v", err)
				}
			}
		case <-a.renewStop:
			return
		}
	}
}

// Shutdown gracefully shuts down the agent
func (a *ParallaxAgent) Shutdown() error {
	// Stop lease renewal
	close(a.renewStop)
	
	// Unregister from control plane
	if a.leaseID != "" {
		conn, err := grpc.NewClient(a.registryAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			client := generated.NewRegistryClient(conn)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			
			_, _ = client.Unregister(ctx, &generated.AgentRegistration{Id: a.ID})
			
			cancel()
			conn.Close()
		}
	}
	
	// Stop gRPC server
	if a.server != nil {
		a.server.GracefulStop()
	}
	
	log.Printf("Agent %s shut down", a.ID)
	return nil
}

// handleShutdown handles graceful shutdown on signals
func (a *ParallaxAgent) handleShutdown() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	
	<-sigChan
	log.Println("Shutting down agent...")
	a.Shutdown()
	os.Exit(0)
}

// Helper function to get environment variable with default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}