package parallax

import (
	"context"
	"time"
)

// AgentInfo represents an AI agent's information in the system
type AgentInfo struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Status       AgentStatus       `json:"status"`
	Capabilities []string          `json:"capabilities"`
	Endpoint     string            `json:"endpoint"`
	LastSeen     time.Time         `json:"lastSeen"`
	Confidence   float64           `json:"confidence"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// AgentStatus represents the status of an agent
type AgentStatus string

const (
	AgentStatusActive   AgentStatus = "active"
	AgentStatusInactive AgentStatus = "inactive"
	AgentStatusError    AgentStatus = "error"
)

// Pattern represents a coordination pattern
type Pattern struct {
	Name                 string   `json:"name"`
	Description          string   `json:"description"`
	Enabled              bool     `json:"enabled"`
	RequiredCapabilities []string `json:"requiredCapabilities"`
	Config               PatternConfig `json:"config"`
}

// PatternConfig holds pattern-specific configuration
type PatternConfig struct {
	MinAgents           int               `json:"minAgents,omitempty"`
	MaxAgents           int               `json:"maxAgents,omitempty"`
	ConsensusThreshold  float64           `json:"consensusThreshold,omitempty"`
	ConfidenceThreshold float64           `json:"confidenceThreshold,omitempty"`
	Timeout             time.Duration     `json:"timeout,omitempty"`
	Parameters          map[string]interface{} `json:"parameters,omitempty"`
}

// PatternExecution represents the execution of a pattern
type PatternExecution struct {
	ID         string                 `json:"id"`
	Pattern    string                 `json:"pattern"`
	Status     ExecutionStatus        `json:"status"`
	Input      interface{}            `json:"input"`
	Output     interface{}            `json:"output,omitempty"`
	Agents     []string               `json:"agents"`
	StartTime  time.Time              `json:"startTime"`
	EndTime    *time.Time             `json:"endTime,omitempty"`
	Duration   time.Duration          `json:"duration,omitempty"`
	Confidence float64                `json:"confidence,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// ExecutionStatus represents the status of pattern execution
type ExecutionStatus string

const (
	ExecutionStatusPending   ExecutionStatus = "pending"
	ExecutionStatusRunning   ExecutionStatus = "running"
	ExecutionStatusCompleted ExecutionStatus = "completed"
	ExecutionStatusFailed    ExecutionStatus = "failed"
)

// ExecuteOptions holds options for pattern execution
type ExecuteOptions struct {
	Async          bool                   `json:"async,omitempty"`
	Priority       int                    `json:"priority,omitempty"`
	Timeout        time.Duration          `json:"timeout,omitempty"`
	AgentSelector  AgentSelector          `json:"agentSelector,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	TraceID        string                 `json:"traceId,omitempty"`
}

// AgentSelector defines how to select agents for pattern execution
type AgentSelector struct {
	Capabilities []string          `json:"capabilities,omitempty"`
	IDs          []string          `json:"ids,omitempty"`
	MinCount     int               `json:"minCount,omitempty"`
	MaxCount     int               `json:"maxCount,omitempty"`
	Strategy     SelectionStrategy `json:"strategy,omitempty"`
}

// SelectionStrategy defines how agents are selected
type SelectionStrategy string

const (
	SelectionStrategyRandom     SelectionStrategy = "random"
	SelectionStrategyRoundRobin SelectionStrategy = "round_robin"
	SelectionStrategyBestFit    SelectionStrategy = "best_fit"
	SelectionStrategyAll        SelectionStrategy = "all"
)

// PatternService defines operations on patterns
type PatternService interface {
	// List returns all available patterns
	List(ctx context.Context) ([]*Pattern, error)

	// Get returns a specific pattern by name
	Get(ctx context.Context, name string) (*Pattern, error)

	// Execute runs a pattern with the given input
	Execute(ctx context.Context, pattern string, input interface{}, opts *ExecuteOptions) (*PatternExecution, error)

	// GetExecution returns the status of a pattern execution
	GetExecution(ctx context.Context, executionID string) (*PatternExecution, error)

	// ListExecutions returns recent pattern executions
	ListExecutions(ctx context.Context, limit int) ([]*PatternExecution, error)

	// StreamExecutions streams pattern execution updates
	StreamExecutions(ctx context.Context) (<-chan *PatternExecution, error)
}

// AgentService defines operations on agents
type AgentService interface {
	// Register registers a new agent
	Register(ctx context.Context, agent *AgentInfo) error

	// List returns all registered agents
	List(ctx context.Context) ([]*AgentInfo, error)

	// Get returns a specific agent by ID
	Get(ctx context.Context, id string) (*AgentInfo, error)

	// UpdateStatus updates an agent's status
	UpdateStatus(ctx context.Context, id string, status AgentStatus) error

	// UpdateConfidence updates an agent's confidence score
	UpdateConfidence(ctx context.Context, id string, confidence float64) error

	// Heartbeat sends a heartbeat for an agent
	Heartbeat(ctx context.Context, id string) error

	// Unregister removes an agent from the system
	Unregister(ctx context.Context, id string) error

	// StreamAgents streams agent updates
	StreamAgents(ctx context.Context) (<-chan *AgentInfo, error)
}