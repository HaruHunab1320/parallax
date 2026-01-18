package parallax

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
)

// Client represents a Parallax control plane client
type Client struct {
	endpoint   string
	conn       *grpc.ClientConn
	logger     *zap.Logger
	patternSvc PatternService
	agentSvc   AgentService
}

// ClientConfig holds configuration for the Parallax client
type ClientConfig struct {
	Endpoint        string
	Logger          *zap.Logger
	MaxRetries      int
	RequestTimeout  time.Duration
	KeepAlive       time.Duration
	ConnectTimeout  time.Duration
	TLSConfig       *TLSConfig
}

// TLSConfig holds TLS configuration
type TLSConfig struct {
	CertFile   string
	KeyFile    string
	CAFile     string
	ServerName string
}

// NewClient creates a new Parallax client
func NewClient(config ClientConfig) (*Client, error) {
	if config.Endpoint == "" {
		config.Endpoint = "localhost:8080"
	}

	if config.Logger == nil {
		config.Logger = zap.NewNop()
	}

	if config.RequestTimeout == 0 {
		config.RequestTimeout = 30 * time.Second
	}

	if config.KeepAlive == 0 {
		config.KeepAlive = 30 * time.Second
	}

	if config.ConnectTimeout == 0 {
		config.ConnectTimeout = 10 * time.Second
	}

	// Set up gRPC connection options
	dialOpts := []grpc.DialOption{
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                config.KeepAlive,
			Timeout:             config.KeepAlive,
			PermitWithoutStream: true,
		}),
	}

	// Configure TLS if provided
	if config.TLSConfig != nil {
		if config.TLSConfig.CAFile != "" {
			creds, err := credentials.NewClientTLSFromFile(config.TLSConfig.CAFile, config.TLSConfig.ServerName)
			if err != nil {
				return nil, fmt.Errorf("failed to load TLS config: %w", err)
			}
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(creds))
		} else {
			tlsConfig := &tls.Config{ServerName: config.TLSConfig.ServerName}
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
		}
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	// Create connection
	ctx, cancel := context.WithTimeout(context.Background(), config.ConnectTimeout)
	defer cancel()

	conn, err := grpc.DialContext(ctx, config.Endpoint, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to control plane: %w", err)
	}

	client := &Client{
		endpoint: config.Endpoint,
		conn:     conn,
		logger:   config.Logger,
	}

	// Initialize services
	client.patternSvc = &patternService{
		client: client,
		logger: config.Logger.With(zap.String("service", "pattern")),
	}

	client.agentSvc = &agentService{
		client: client,
		logger: config.Logger.With(zap.String("service", "agent")),
		leases: make(map[string]string),
	}

	config.Logger.Info("Parallax client connected",
		zap.String("endpoint", config.Endpoint),
	)

	return client, nil
}

// Close closes the client connection
func (c *Client) Close() error {
	if c.conn != nil {
		c.logger.Info("Closing Parallax client connection")
		return c.conn.Close()
	}
	return nil
}

// Patterns returns the pattern service
func (c *Client) Patterns() PatternService {
	return c.patternSvc
}

// Agents returns the agent service
func (c *Client) Agents() AgentService {
	return c.agentSvc
}

// HealthCheck checks if the control plane is healthy
func (c *Client) HealthCheck(ctx context.Context) error {
	if c.conn == nil {
		return fmt.Errorf("client connection is not initialized")
	}

	client := grpc_health_v1.NewHealthClient(c.conn)
	response, err := client.Check(ctx, &grpc_health_v1.HealthCheckRequest{})
	if err != nil {
		return err
	}
	if response.Status != grpc_health_v1.HealthCheckResponse_SERVING {
		return fmt.Errorf("control plane health status: %s", response.Status.String())
	}
	return nil
}
