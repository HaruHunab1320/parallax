package parallax

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"parallax/sdk-go/generated"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/structpb"
)

// patternService implements PatternService
type patternService struct {
	client *Client
	logger *zap.Logger
}

// List returns all available patterns
func (s *patternService) List(ctx context.Context) ([]*Pattern, error) {
	s.logger.Debug("Listing patterns")

	client := generated.NewPatternServiceClient(s.client.conn)
	response, err := client.ListPatterns(ctx, &generated.ListPatternsRequest{})
	if err != nil {
		return nil, err
	}

	patterns := make([]*Pattern, 0, len(response.Patterns))
	for _, pattern := range response.Patterns {
		patterns = append(patterns, patternFromProto(pattern))
	}

	return patterns, nil
}

// Get returns a specific pattern by name
func (s *patternService) Get(ctx context.Context, name string) (*Pattern, error) {
	s.logger.Debug("Getting pattern", zap.String("name", name))

	client := generated.NewPatternServiceClient(s.client.conn)
	response, err := client.GetPattern(ctx, &generated.GetPatternRequest{Name: name})
	if err != nil {
		return nil, err
	}

	return patternFromProto(response), nil
}

// Execute runs a pattern with the given input
func (s *patternService) Execute(ctx context.Context, pattern string, input interface{}, opts *ExecuteOptions) (*PatternExecution, error) {
	s.logger.Info("Executing pattern",
		zap.String("pattern", pattern),
		zap.Any("input", input),
		zap.Any("options", opts),
	)
	
	if opts == nil {
		opts = &ExecuteOptions{}
	}

	inputStruct, err := toStruct(input)
	if err != nil {
		return nil, err
	}

	req := &generated.ExecutePatternRequest{
		PatternName: pattern,
		Input:       inputStruct,
		Options: &generated.ExecutePatternRequest_Options{
			TimeoutMs: int32(opts.Timeout.Milliseconds()),
		},
	}

	client := generated.NewPatternServiceClient(s.client.conn)
	response, err := client.ExecutePattern(ctx, req)
	if err != nil {
		return nil, err
	}

	return executionFromResponse(response, input), nil
}

// GetExecution returns the status of a pattern execution
func (s *patternService) GetExecution(ctx context.Context, executionID string) (*PatternExecution, error) {
	s.logger.Debug("Getting execution", zap.String("id", executionID))

	return nil, fmt.Errorf("get execution is not supported by the gRPC API")
}

// ListExecutions returns recent pattern executions
func (s *patternService) ListExecutions(ctx context.Context, limit int) ([]*PatternExecution, error) {
	s.logger.Debug("Listing executions", zap.Int("limit", limit))

	return nil, fmt.Errorf("list executions is not supported by the gRPC API")
}

// StreamExecutions streams pattern execution updates
func (s *patternService) StreamExecutions(ctx context.Context) (<-chan *PatternExecution, error) {
	s.logger.Debug("Streaming executions")

	return nil, fmt.Errorf("stream executions is not supported by the gRPC API")
}

func patternFromProto(pattern *generated.Pattern) *Pattern {
	requirements := pattern.GetRequirements()
	return &Pattern{
		Name:                 pattern.GetName(),
		Description:          pattern.GetDescription(),
		Enabled:              true,
		RequiredCapabilities: requirements.GetCapabilities(),
		Config: PatternConfig{
			MinAgents:           int(requirements.GetMinAgents()),
			MaxAgents:           int(requirements.GetMaxAgents()),
			ConfidenceThreshold: requirements.GetMinConfidence(),
		},
	}
}

func executionFromResponse(response *generated.ExecutePatternResponse, input interface{}) *PatternExecution {
	metrics := response.GetMetrics()
	var start time.Time
	var end *time.Time
	if metrics != nil && metrics.StartTime != nil {
		start = metrics.StartTime.AsTime()
	}
	if metrics != nil && metrics.EndTime != nil {
		endTime := metrics.EndTime.AsTime()
		end = &endTime
	}

	var duration time.Duration
	if end != nil && !start.IsZero() {
		duration = end.Sub(start)
	}

	return &PatternExecution{
		ID:         response.GetExecutionId(),
		Pattern:    response.GetPatternName(),
		Status:     statusFromProto(response.GetStatus()),
		Input:      input,
		Output:     structToMap(response.GetResult()),
		Agents:     []string{},
		StartTime:  start,
		EndTime:    end,
		Duration:   duration,
		Confidence: response.GetConfidence(),
		Error:      response.GetErrorMessage(),
	}
}

func statusFromProto(status generated.ExecutePatternResponse_Status) ExecutionStatus {
	switch status {
	case generated.ExecutePatternResponse_SUCCESS:
		return ExecutionStatusCompleted
	case generated.ExecutePatternResponse_FAILURE:
		return ExecutionStatusFailed
	default:
		return ExecutionStatusRunning
	}
}

func toStruct(input interface{}) (*structpb.Struct, error) {
	if input == nil {
		return &structpb.Struct{Fields: map[string]*structpb.Value{}}, nil
	}

	if value, ok := input.(map[string]interface{}); ok {
		return structpb.NewStruct(value)
	}

	raw, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input: %w", err)
	}

	var value map[string]interface{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("failed to unmarshal input: %w", err)
	}

	return structpb.NewStruct(value)
}

func structToMap(value *structpb.Struct) map[string]interface{} {
	if value == nil {
		return nil
	}
	return value.AsMap()
}
