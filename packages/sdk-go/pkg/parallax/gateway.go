package parallax

import (
	"context"
	"fmt"
	"io"
	"log"
	"math"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/parallaxai/sdk-go/generated"
)

// GatewayOptions configures the gateway connection behavior.
type GatewayOptions struct {
	Credentials             credentials.TransportCredentials
	HeartbeatIntervalMs     int  // default 10000
	AutoReconnect           bool // default true
	MaxReconnectAttempts    int  // 0 = infinity
	InitialReconnectDelayMs int  // default 1000
	MaxReconnectDelayMs     int  // default 30000
}

// defaultGatewayOptions returns GatewayOptions with sensible defaults applied.
func defaultGatewayOptions() *GatewayOptions {
	return &GatewayOptions{
		HeartbeatIntervalMs:     10000,
		AutoReconnect:           true,
		MaxReconnectAttempts:    0,
		InitialReconnectDelayMs: 1000,
		MaxReconnectDelayMs:     30000,
	}
}

// applyDefaults fills in zero-valued fields with defaults.
func (o *GatewayOptions) applyDefaults() {
	defaults := defaultGatewayOptions()
	if o.HeartbeatIntervalMs == 0 {
		o.HeartbeatIntervalMs = defaults.HeartbeatIntervalMs
	}
	if o.InitialReconnectDelayMs == 0 {
		o.InitialReconnectDelayMs = defaults.InitialReconnectDelayMs
	}
	if o.MaxReconnectDelayMs == 0 {
		o.MaxReconnectDelayMs = defaults.MaxReconnectDelayMs
	}
	// AutoReconnect defaults to true; since Go zero-value for bool is false,
	// we only set it in defaultGatewayOptions and callers must explicitly set it.
}

// ConnectViaGateway connects to the control plane gateway for NAT traversal.
// The agent connects outbound; the control plane sends tasks back through
// the established bidirectional stream.
func (a *ParallaxAgent) ConnectViaGateway(endpoint string, opts *GatewayOptions) error {
	if opts == nil {
		opts = defaultGatewayOptions()
	} else {
		opts.applyDefaults()
	}

	a.mu.Lock()
	a.gatewayEndpoint = endpoint
	a.gatewayOpts = opts
	a.mu.Unlock()

	return a.connectGateway()
}

// connectGateway establishes the gateway stream and starts background goroutines.
func (a *ParallaxAgent) connectGateway() error {
	a.mu.Lock()
	endpoint := a.gatewayEndpoint
	opts := a.gatewayOpts
	a.mu.Unlock()

	// Build dial options
	dialOpts := []grpc.DialOption{}
	if opts.Credentials != nil {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(opts.Credentials))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(endpoint, dialOpts...)
	if err != nil {
		return fmt.Errorf("failed to connect to gateway at %s: %w", endpoint, err)
	}

	client := generated.NewAgentGatewayClient(conn)

	ctx, cancel := context.WithCancel(context.Background())

	stream, err := client.Connect(ctx)
	if err != nil {
		cancel()
		conn.Close()
		return fmt.Errorf("failed to open gateway stream: %w", err)
	}

	// Convert metadata map[string]interface{} to map[string]string
	metadata := make(map[string]string)
	for k, v := range a.Metadata {
		metadata[k] = fmt.Sprintf("%v", v)
	}

	// Send AgentHello as the first message
	helloMsg := &generated.AgentToControlPlane{
		RequestId: generateID(),
		Payload: &generated.AgentToControlPlane_Hello{
			Hello: &generated.AgentHello{
				AgentId:             a.ID,
				AgentName:           a.Name,
				Capabilities:        a.Capabilities,
				Metadata:            metadata,
				HeartbeatIntervalMs: int32(opts.HeartbeatIntervalMs),
			},
		},
	}

	if err := stream.Send(helloMsg); err != nil {
		cancel()
		conn.Close()
		return fmt.Errorf("failed to send AgentHello: %w", err)
	}

	// Wait for ServerAck
	ackMsg, err := stream.Recv()
	if err != nil {
		cancel()
		conn.Close()
		return fmt.Errorf("failed to receive ServerAck: %w", err)
	}

	ack := ackMsg.GetAck()
	if ack == nil {
		cancel()
		conn.Close()
		return fmt.Errorf("expected ServerAck, got different message type")
	}

	if !ack.Accepted {
		cancel()
		conn.Close()
		return fmt.Errorf("gateway connection rejected: %s", ack.Message)
	}

	log.Printf("Agent %s connected via gateway at %s (node: %s)", a.ID, endpoint, ack.AssignedNodeId)

	// Store connection state
	a.mu.Lock()
	a.gatewayStream = stream
	a.gatewayConn = conn
	a.gatewayCancel = cancel
	a.gatewayCtx = ctx
	a.mu.Unlock()

	// Start heartbeat goroutine
	go a.gatewayHeartbeat()

	// Start message receiver goroutine
	go a.gatewayReceiver()

	return nil
}

// gatewayHeartbeat sends periodic heartbeats over the gateway stream.
func (a *ParallaxAgent) gatewayHeartbeat() {
	a.mu.Lock()
	intervalMs := a.gatewayOpts.HeartbeatIntervalMs
	a.mu.Unlock()

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		a.mu.Lock()
		ctx := a.gatewayCtx
		stream := a.gatewayStream
		a.mu.Unlock()

		if ctx == nil || stream == nil {
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			msg := &generated.AgentToControlPlane{
				RequestId: generateID(),
				Payload: &generated.AgentToControlPlane_Heartbeat{
					Heartbeat: &generated.AgentHeartbeat{
						AgentId: a.ID,
						Load:    0.0,
						Status:  "healthy",
					},
				},
			}

			a.mu.Lock()
			s := a.gatewayStream
			a.mu.Unlock()

			if s == nil {
				return
			}

			if err := s.Send(msg); err != nil {
				log.Printf("Failed to send heartbeat: %v", err)
				return
			}
		}
	}
}

// gatewayReceiver reads messages from the gateway stream and dispatches them.
func (a *ParallaxAgent) gatewayReceiver() {
	for {
		a.mu.Lock()
		ctx := a.gatewayCtx
		stream := a.gatewayStream
		a.mu.Unlock()

		if ctx == nil || stream == nil {
			return
		}

		// Check context cancellation
		select {
		case <-ctx.Done():
			return
		default:
		}

		msg, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				log.Printf("Gateway stream closed by server")
			} else {
				select {
				case <-ctx.Done():
					// Context was cancelled, normal shutdown
					return
				default:
					log.Printf("Gateway stream error: %v", err)
				}
			}

			// Attempt reconnect if configured
			a.mu.Lock()
			opts := a.gatewayOpts
			a.mu.Unlock()

			if opts != nil && opts.AutoReconnect {
				a.reconnectGateway()
			}
			return
		}

		a.handleGatewayMessage(msg)
	}
}

// handleGatewayMessage processes a single message from the control plane.
func (a *ParallaxAgent) handleGatewayMessage(msg *generated.ControlPlaneToAgent) {
	switch {
	case msg.GetTaskRequest() != nil:
		go a.handleTaskRequest(msg.GetRequestId(), msg.GetTaskRequest())

	case msg.GetCancelTask() != nil:
		ct := msg.GetCancelTask()
		log.Printf("Received cancel request for task %s: %s", ct.TaskId, ct.Reason)

	case msg.GetPing() != nil:
		// Respond to ping with a heartbeat
		hb := &generated.AgentToControlPlane{
			RequestId: msg.GetRequestId(),
			Payload: &generated.AgentToControlPlane_Heartbeat{
				Heartbeat: &generated.AgentHeartbeat{
					AgentId: a.ID,
					Load:    0.0,
					Status:  "healthy",
				},
			},
		}

		a.mu.Lock()
		s := a.gatewayStream
		a.mu.Unlock()

		if s != nil {
			if err := s.Send(hb); err != nil {
				log.Printf("Failed to send ping response: %v", err)
			}
		}

	case msg.GetAck() != nil:
		// Unexpected ack after initial connection; log and ignore
		log.Printf("Received unexpected ServerAck: %s", msg.GetAck().Message)
	}
}

// handleTaskRequest processes an incoming task from the gateway.
func (a *ParallaxAgent) handleTaskRequest(requestID string, req *generated.TaskRequest) {
	if a.AnalyzeFunc == nil {
		a.sendTaskError(requestID, req.TaskId, "analyze function not implemented", "UNIMPLEMENTED")
		return
	}

	// Convert protobuf Struct data to interface{}
	var data interface{}
	if req.Data != nil {
		data = req.Data.AsMap()
	}

	ctx := context.Background()
	if req.TimeoutMs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(req.TimeoutMs)*time.Millisecond)
		defer cancel()
	}

	result, err := a.AnalyzeFunc(ctx, req.TaskDescription, data)
	if err != nil {
		a.sendTaskError(requestID, req.TaskId, err.Error(), "ANALYSIS_FAILED")
		return
	}

	// Send TaskResult
	msg := &generated.AgentToControlPlane{
		RequestId: requestID,
		Payload: &generated.AgentToControlPlane_TaskResult{
			TaskResult: &generated.TaskResult{
				TaskId:     req.TaskId,
				ValueJson:  mustMarshalJSON(result.Value),
				Confidence: result.Confidence,
				Reasoning:  result.Reasoning,
				Metadata:   result.Metadata,
			},
		},
	}

	a.mu.Lock()
	s := a.gatewayStream
	a.mu.Unlock()

	if s != nil {
		if err := s.Send(msg); err != nil {
			log.Printf("Failed to send task result for %s: %v", req.TaskId, err)
		}
	}
}

// sendTaskError sends a TaskError message over the gateway stream.
func (a *ParallaxAgent) sendTaskError(requestID, taskID, errMsg, errCode string) {
	msg := &generated.AgentToControlPlane{
		RequestId: requestID,
		Payload: &generated.AgentToControlPlane_TaskError{
			TaskError: &generated.TaskError{
				TaskId:       taskID,
				ErrorMessage: errMsg,
				ErrorCode:    errCode,
			},
		},
	}

	a.mu.Lock()
	s := a.gatewayStream
	a.mu.Unlock()

	if s != nil {
		if err := s.Send(msg); err != nil {
			log.Printf("Failed to send task error for %s: %v", taskID, err)
		}
	}
}

// reconnectGateway attempts to reconnect to the gateway with exponential backoff.
func (a *ParallaxAgent) reconnectGateway() {
	a.mu.Lock()
	opts := a.gatewayOpts
	a.mu.Unlock()

	if opts == nil {
		return
	}

	delay := time.Duration(opts.InitialReconnectDelayMs) * time.Millisecond
	maxDelay := time.Duration(opts.MaxReconnectDelayMs) * time.Millisecond
	maxAttempts := opts.MaxReconnectAttempts

	for attempt := 1; maxAttempts == 0 || attempt <= maxAttempts; attempt++ {
		log.Printf("Gateway reconnect attempt %d (delay: %v)", attempt, delay)

		// Clean up previous connection
		a.cleanupGateway()

		time.Sleep(delay)

		if err := a.connectGateway(); err != nil {
			log.Printf("Gateway reconnect attempt %d failed: %v", attempt, err)

			// Exponential backoff with cap
			delay = time.Duration(math.Min(
				float64(delay)*2,
				float64(maxDelay),
			))
			continue
		}

		log.Printf("Gateway reconnected successfully on attempt %d", attempt)
		return
	}

	log.Printf("Gateway reconnect failed after %d attempts", maxAttempts)
}

// cleanupGateway cleans up the current gateway connection resources.
func (a *ParallaxAgent) cleanupGateway() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.gatewayCancel != nil {
		a.gatewayCancel()
		a.gatewayCancel = nil
	}
	a.gatewayStream = nil
	if a.gatewayConn != nil {
		a.gatewayConn.Close()
		a.gatewayConn = nil
	}
	a.gatewayCtx = nil
}

// shutdownGateway is called from Shutdown to clean up gateway resources.
func (a *ParallaxAgent) shutdownGateway() {
	a.mu.Lock()
	hasGateway := a.gatewayStream != nil
	a.mu.Unlock()

	if !hasGateway {
		return
	}

	log.Printf("Shutting down gateway connection for agent %s", a.ID)
	a.cleanupGateway()
}

// GatewayStreamInterface abstracts the bidirectional stream for testing.
type GatewayStreamInterface interface {
	Send(*generated.AgentToControlPlane) error
	Recv() (*generated.ControlPlaneToAgent, error)
}
