package parallax

import (
	"context"
	"fmt"
	"net"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/structpb"

	"github.com/parallaxai/sdk-go/generated"
)

// --- Mock gateway server ---

type mockGatewayServer struct {
	generated.UnimplementedAgentGatewayServer
	mu            sync.Mutex
	received      []*generated.AgentToControlPlane
	toSend        []*generated.ControlPlaneToAgent
	onConnected   func(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent])
	connectCalled bool
}

func (m *mockGatewayServer) Connect(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent]) error {
	m.mu.Lock()
	m.connectCalled = true
	m.mu.Unlock()

	if m.onConnected != nil {
		m.onConnected(stream)
		return nil
	}

	// Default: read hello, send ack, then send queued messages
	hello, err := stream.Recv()
	if err != nil {
		return err
	}

	m.mu.Lock()
	m.received = append(m.received, hello)
	m.mu.Unlock()

	// Send ServerAck
	ack := &generated.ControlPlaneToAgent{
		RequestId: hello.RequestId,
		Payload: &generated.ControlPlaneToAgent_Ack{
			Ack: &generated.ServerAck{
				Accepted:       true,
				Message:        "welcome",
				AssignedNodeId: "node-1",
			},
		},
	}
	if err := stream.Send(ack); err != nil {
		return err
	}

	// Send any queued messages
	m.mu.Lock()
	toSend := make([]*generated.ControlPlaneToAgent, len(m.toSend))
	copy(toSend, m.toSend)
	m.mu.Unlock()

	for _, msg := range toSend {
		if err := stream.Send(msg); err != nil {
			return err
		}
	}

	// Keep receiving until stream closes
	for {
		msg, err := stream.Recv()
		if err != nil {
			return nil
		}
		m.mu.Lock()
		m.received = append(m.received, msg)
		m.mu.Unlock()
	}
}

func startMockGateway(t *testing.T, srv *mockGatewayServer) (string, func()) {
	t.Helper()
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}

	s := grpc.NewServer()
	generated.RegisterAgentGatewayServer(s, srv)

	go s.Serve(lis)

	return lis.Addr().String(), func() {
		s.Stop()
		lis.Close()
	}
}

// --- Tests ---

func TestGatewayOptionsDefaults(t *testing.T) {
	opts := defaultGatewayOptions()

	if opts.HeartbeatIntervalMs != 10000 {
		t.Errorf("expected HeartbeatIntervalMs=10000, got %d", opts.HeartbeatIntervalMs)
	}
	if !opts.AutoReconnect {
		t.Error("expected AutoReconnect=true")
	}
	if opts.MaxReconnectAttempts != 0 {
		t.Errorf("expected MaxReconnectAttempts=0, got %d", opts.MaxReconnectAttempts)
	}
	if opts.InitialReconnectDelayMs != 1000 {
		t.Errorf("expected InitialReconnectDelayMs=1000, got %d", opts.InitialReconnectDelayMs)
	}
	if opts.MaxReconnectDelayMs != 30000 {
		t.Errorf("expected MaxReconnectDelayMs=30000, got %d", opts.MaxReconnectDelayMs)
	}
}

func TestGatewayOptionsApplyDefaults(t *testing.T) {
	opts := &GatewayOptions{
		HeartbeatIntervalMs: 5000,
		// Leave others at zero
	}
	opts.applyDefaults()

	if opts.HeartbeatIntervalMs != 5000 {
		t.Errorf("expected HeartbeatIntervalMs=5000 (user-set), got %d", opts.HeartbeatIntervalMs)
	}
	if opts.InitialReconnectDelayMs != 1000 {
		t.Errorf("expected InitialReconnectDelayMs=1000 (default), got %d", opts.InitialReconnectDelayMs)
	}
	if opts.MaxReconnectDelayMs != 30000 {
		t.Errorf("expected MaxReconnectDelayMs=30000 (default), got %d", opts.MaxReconnectDelayMs)
	}
}

func TestConnectViaGatewaySendsHello(t *testing.T) {
	mock := &mockGatewayServer{}
	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("test-agent", "Test Agent", []string{"analyze"}, map[string]interface{}{
		"version": "1.0",
	})

	opts := &GatewayOptions{
		HeartbeatIntervalMs: 60000, // long interval to avoid heartbeats during test
		AutoReconnect:       false,
	}

	err := agent.ConnectViaGateway(addr, opts)
	if err != nil {
		t.Fatalf("ConnectViaGateway failed: %v", err)
	}
	defer agent.shutdownGateway()

	// Check that the hello was received
	mock.mu.Lock()
	defer mock.mu.Unlock()

	if len(mock.received) < 1 {
		t.Fatal("expected at least 1 message received by server")
	}

	hello := mock.received[0].GetHello()
	if hello == nil {
		t.Fatal("first message should be AgentHello")
	}
	if hello.AgentId != "test-agent" {
		t.Errorf("expected agent_id='test-agent', got '%s'", hello.AgentId)
	}
	if hello.AgentName != "Test Agent" {
		t.Errorf("expected agent_name='Test Agent', got '%s'", hello.AgentName)
	}
	if len(hello.Capabilities) != 1 || hello.Capabilities[0] != "analyze" {
		t.Errorf("expected capabilities=['analyze'], got %v", hello.Capabilities)
	}
	if hello.Metadata["version"] != "1.0" {
		t.Errorf("expected metadata[version]='1.0', got '%s'", hello.Metadata["version"])
	}
	if hello.HeartbeatIntervalMs != 60000 {
		t.Errorf("expected heartbeat_interval_ms=60000, got %d", hello.HeartbeatIntervalMs)
	}
}

func TestConnectViaGatewayRejected(t *testing.T) {
	mock := &mockGatewayServer{
		onConnected: func(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent]) {
			// Read hello
			msg, err := stream.Recv()
			if err != nil {
				return
			}
			// Send rejection
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: msg.RequestId,
				Payload: &generated.ControlPlaneToAgent_Ack{
					Ack: &generated.ServerAck{
						Accepted: false,
						Message:  "agent not authorized",
					},
				},
			})
		},
	}
	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("bad-agent", "Bad Agent", nil, nil)
	err := agent.ConnectViaGateway(addr, &GatewayOptions{AutoReconnect: false})
	if err == nil {
		t.Fatal("expected error for rejected connection")
	}
	if got := err.Error(); got != "gateway connection rejected: agent not authorized" {
		t.Errorf("unexpected error message: %s", got)
	}
}

func TestGatewayTaskDispatch(t *testing.T) {
	resultCh := make(chan *generated.AgentToControlPlane, 1)

	mock := &mockGatewayServer{
		onConnected: func(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent]) {
			// Read hello
			hello, err := stream.Recv()
			if err != nil {
				return
			}

			// Send ack
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: hello.RequestId,
				Payload: &generated.ControlPlaneToAgent_Ack{
					Ack: &generated.ServerAck{Accepted: true, AssignedNodeId: "node-1"},
				},
			})

			// Send a task request
			data, _ := structpb.NewStruct(map[string]interface{}{
				"input": "test-data",
			})
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: "req-123",
				Payload: &generated.ControlPlaneToAgent_TaskRequest{
					TaskRequest: &generated.TaskRequest{
						TaskId:          "task-1",
						TaskDescription: "analyze this",
						Data:            data,
						TimeoutMs:       5000,
					},
				},
			})

			// Wait for the task result
			for {
				msg, err := stream.Recv()
				if err != nil {
					return
				}
				if msg.GetTaskResult() != nil || msg.GetTaskError() != nil {
					resultCh <- msg
					return
				}
			}
		},
	}

	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("worker", "Worker Agent", []string{"analyze"}, nil)
	agent.AnalyzeFunc = func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
		return &AgentResult{
			Value:      map[string]string{"answer": "42"},
			Confidence: 0.95,
			Reasoning:  "computed",
			Metadata:   map[string]string{"source": "test"},
		}, nil
	}

	err := agent.ConnectViaGateway(addr, &GatewayOptions{
		HeartbeatIntervalMs: 60000,
		AutoReconnect:       false,
	})
	if err != nil {
		t.Fatalf("ConnectViaGateway failed: %v", err)
	}
	defer agent.shutdownGateway()

	select {
	case result := <-resultCh:
		tr := result.GetTaskResult()
		if tr == nil {
			t.Fatal("expected TaskResult")
		}
		if tr.TaskId != "task-1" {
			t.Errorf("expected task_id='task-1', got '%s'", tr.TaskId)
		}
		if tr.Confidence != 0.95 {
			t.Errorf("expected confidence=0.95, got %f", tr.Confidence)
		}
		if tr.Reasoning != "computed" {
			t.Errorf("expected reasoning='computed', got '%s'", tr.Reasoning)
		}
		if result.RequestId != "req-123" {
			t.Errorf("expected request_id='req-123', got '%s'", result.RequestId)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for task result")
	}
}

func TestGatewayTaskError(t *testing.T) {
	resultCh := make(chan *generated.AgentToControlPlane, 1)

	mock := &mockGatewayServer{
		onConnected: func(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent]) {
			hello, _ := stream.Recv()
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: hello.RequestId,
				Payload: &generated.ControlPlaneToAgent_Ack{
					Ack: &generated.ServerAck{Accepted: true},
				},
			})

			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: "req-err",
				Payload: &generated.ControlPlaneToAgent_TaskRequest{
					TaskRequest: &generated.TaskRequest{
						TaskId:          "task-fail",
						TaskDescription: "do something",
					},
				},
			})

			for {
				msg, err := stream.Recv()
				if err != nil {
					return
				}
				if msg.GetTaskError() != nil {
					resultCh <- msg
					return
				}
			}
		},
	}

	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("err-agent", "Error Agent", nil, nil)
	agent.AnalyzeFunc = func(ctx context.Context, task string, data interface{}) (*AgentResult, error) {
		return nil, fmt.Errorf("something went wrong")
	}

	err := agent.ConnectViaGateway(addr, &GatewayOptions{
		HeartbeatIntervalMs: 60000,
		AutoReconnect:       false,
	})
	if err != nil {
		t.Fatalf("ConnectViaGateway failed: %v", err)
	}
	defer agent.shutdownGateway()

	select {
	case result := <-resultCh:
		te := result.GetTaskError()
		if te == nil {
			t.Fatal("expected TaskError")
		}
		if te.TaskId != "task-fail" {
			t.Errorf("expected task_id='task-fail', got '%s'", te.TaskId)
		}
		if te.ErrorMessage != "something went wrong" {
			t.Errorf("expected error_message='something went wrong', got '%s'", te.ErrorMessage)
		}
		if te.ErrorCode != "ANALYSIS_FAILED" {
			t.Errorf("expected error_code='ANALYSIS_FAILED', got '%s'", te.ErrorCode)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for task error")
	}
}

func TestGatewayPingResponse(t *testing.T) {
	responseCh := make(chan *generated.AgentToControlPlane, 1)

	mock := &mockGatewayServer{
		onConnected: func(stream grpc.BidiStreamingServer[generated.AgentToControlPlane, generated.ControlPlaneToAgent]) {
			hello, _ := stream.Recv()
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: hello.RequestId,
				Payload: &generated.ControlPlaneToAgent_Ack{
					Ack: &generated.ServerAck{Accepted: true},
				},
			})

			// Send a ping
			stream.Send(&generated.ControlPlaneToAgent{
				RequestId: "ping-1",
				Payload: &generated.ControlPlaneToAgent_Ping{
					Ping: &generated.Ping{},
				},
			})

			// Wait for heartbeat response
			for {
				msg, err := stream.Recv()
				if err != nil {
					return
				}
				if msg.GetHeartbeat() != nil {
					responseCh <- msg
					return
				}
			}
		},
	}

	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("ping-agent", "Ping Agent", nil, nil)

	err := agent.ConnectViaGateway(addr, &GatewayOptions{
		HeartbeatIntervalMs: 60000,
		AutoReconnect:       false,
	})
	if err != nil {
		t.Fatalf("ConnectViaGateway failed: %v", err)
	}
	defer agent.shutdownGateway()

	select {
	case resp := <-responseCh:
		hb := resp.GetHeartbeat()
		if hb == nil {
			t.Fatal("expected heartbeat response to ping")
		}
		if hb.AgentId != "ping-agent" {
			t.Errorf("expected agent_id='ping-agent', got '%s'", hb.AgentId)
		}
		if hb.Status != "healthy" {
			t.Errorf("expected status='healthy', got '%s'", hb.Status)
		}
		if resp.RequestId != "ping-1" {
			t.Errorf("expected request_id='ping-1', got '%s'", resp.RequestId)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for ping response")
	}
}

func TestConnectViaGatewayNilOpts(t *testing.T) {
	mock := &mockGatewayServer{}
	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("nil-opts", "Nil Opts Agent", nil, nil)

	err := agent.ConnectViaGateway(addr, nil)
	if err != nil {
		t.Fatalf("ConnectViaGateway with nil opts failed: %v", err)
	}
	defer agent.shutdownGateway()

	// Verify defaults were applied
	agent.mu.Lock()
	opts := agent.gatewayOpts
	agent.mu.Unlock()

	if opts.HeartbeatIntervalMs != 10000 {
		t.Errorf("expected default HeartbeatIntervalMs=10000, got %d", opts.HeartbeatIntervalMs)
	}
}

func TestConnectViaGatewayBadEndpoint(t *testing.T) {
	agent := NewParallaxAgent("bad-ep", "Bad Endpoint Agent", nil, nil)
	// Use a known-bad endpoint that will fail on stream open
	err := agent.ConnectViaGateway("127.0.0.1:1", &GatewayOptions{AutoReconnect: false})
	if err == nil {
		agent.shutdownGateway()
		t.Fatal("expected error connecting to bad endpoint")
	}
}

func TestShutdownCleansGateway(t *testing.T) {
	mock := &mockGatewayServer{}
	addr, cleanup := startMockGateway(t, mock)
	defer cleanup()

	agent := NewParallaxAgent("shutdown-test", "Shutdown Test", nil, nil)

	err := agent.ConnectViaGateway(addr, &GatewayOptions{
		HeartbeatIntervalMs: 60000,
		AutoReconnect:       false,
	})
	if err != nil {
		t.Fatalf("ConnectViaGateway failed: %v", err)
	}

	// Verify stream exists
	agent.mu.Lock()
	hasStream := agent.gatewayStream != nil
	agent.mu.Unlock()
	if !hasStream {
		t.Fatal("expected gateway stream to exist")
	}

	agent.shutdownGateway()

	// Verify stream is cleaned up
	agent.mu.Lock()
	hasStream = agent.gatewayStream != nil
	hasConn := agent.gatewayConn != nil
	hasCancel := agent.gatewayCancel != nil
	agent.mu.Unlock()

	if hasStream {
		t.Error("expected gateway stream to be nil after shutdown")
	}
	if hasConn {
		t.Error("expected gateway conn to be nil after shutdown")
	}
	if hasCancel {
		t.Error("expected gateway cancel to be nil after shutdown")
	}
}

// Suppress unused import warnings for insecure credentials
var _ = insecure.NewCredentials
