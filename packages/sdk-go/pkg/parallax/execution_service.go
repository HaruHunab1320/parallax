package parallax

import (
	"context"
	"time"

	"parallax/sdk-go/generated"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/structpb"
)

// executionService implements ExecutionService
type executionService struct {
	client *Client
	logger *zap.Logger
}

// Get returns a specific execution by ID
func (s *executionService) Get(ctx context.Context, id string) (*PatternExecution, error) {
	client := generated.NewExecutionServiceClient(s.client.conn)
	response, err := client.GetExecution(ctx, &generated.GetExecutionRequest{ExecutionId: id})
	if err != nil {
		return nil, err
	}

	return executionFromProto(response.Execution), nil
}

// List returns recent executions
func (s *executionService) List(ctx context.Context, limit int, offset int, status string) ([]*PatternExecution, error) {
	client := generated.NewExecutionServiceClient(s.client.conn)
	response, err := client.ListExecutions(ctx, &generated.ListExecutionsRequest{
		Limit:  int32(limit),
		Offset: int32(offset),
		Status: status,
	})
	if err != nil {
		return nil, err
	}

	executions := make([]*PatternExecution, 0, len(response.Executions))
	for _, execution := range response.Executions {
		executions = append(executions, executionFromProto(execution))
	}

	return executions, nil
}

// Stream streams execution updates for a specific execution
func (s *executionService) Stream(ctx context.Context, id string) (<-chan *PatternExecution, error) {
	client := generated.NewExecutionServiceClient(s.client.conn)
	stream, err := client.StreamExecution(ctx, &generated.StreamExecutionRequest{
		ExecutionId: id,
	})
	if err != nil {
		return nil, err
	}

	ch := make(chan *PatternExecution)
	go func() {
		defer close(ch)

		for {
			event, err := stream.Recv()
			if err != nil {
				return
			}

			if event.Execution == nil {
				continue
			}

			select {
			case ch <- executionFromProto(event.Execution):
			case <-ctx.Done():
				return
			}
		}
	}()

	return ch, nil
}

func executionFromProto(execution *generated.Execution) *PatternExecution {
	if execution == nil {
		return nil
	}

	var startTime = timeNow()
	if execution.StartTime != nil {
		startTime = execution.StartTime.AsTime()
	}

	var endTime *time.Time
	if execution.EndTime != nil {
		parsed := execution.EndTime.AsTime()
		endTime = &parsed
	}

	var duration time.Duration
	if endTime != nil {
		duration = endTime.Sub(startTime)
	}

	return &PatternExecution{
		ID:         execution.Id,
		Pattern:    execution.PatternName,
		Status:     statusFromExecutionProto(execution.Status),
		Input:      structToMap(execution.Input),
		Output:     structToMap(execution.Result),
		StartTime:  startTime,
		EndTime:    endTime,
		Duration:   duration,
		Confidence: execution.Confidence,
		Error:      execution.Error,
		Metadata:   structToMap(execution.Metrics),
	}
}

func statusFromExecutionProto(status generated.ExecutionStatus) ExecutionStatus {
	switch status {
	case generated.ExecutionStatus_EXECUTION_STATUS_COMPLETED:
		return ExecutionStatusCompleted
	case generated.ExecutionStatus_EXECUTION_STATUS_FAILED:
		return ExecutionStatusFailed
	case generated.ExecutionStatus_EXECUTION_STATUS_RUNNING:
		return ExecutionStatusRunning
	case generated.ExecutionStatus_EXECUTION_STATUS_CANCELLED:
		return ExecutionStatusFailed
	default:
		return ExecutionStatusPending
	}
}

func structToMap(value *structpb.Struct) map[string]interface{} {
	if value == nil {
		return nil
	}
	return value.AsMap()
}
