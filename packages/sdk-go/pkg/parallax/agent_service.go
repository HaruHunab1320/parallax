package parallax

import (
	"context"
	"fmt"

	"parallax/sdk-go/generated"
	"go.uber.org/zap"
)

// agentService implements AgentService
type agentService struct {
	client *Client
	logger *zap.Logger
	leases map[string]string
}

// Register registers a new agent
func (s *agentService) Register(ctx context.Context, agent *AgentInfo) error {
	s.logger.Info("Registering agent",
		zap.String("id", agent.ID),
		zap.String("name", agent.Name),
		zap.Strings("capabilities", agent.Capabilities),
	)
	
	if agent.ID == "" {
		agent.ID = generateID()
	}
	
	if agent.Status == "" {
		agent.Status = AgentStatusActive
	}
	
	if agent.Confidence == 0 {
		agent.Confidence = 0.8
	}
	
	agent.LastSeen = timeNow()

	labels := map[string]string{}
	for key, value := range agent.Metadata {
		labels[key] = value
	}

	registration := &generated.AgentRegistration{
		Id:           agent.ID,
		Name:         agent.Name,
		Endpoint:     agent.Endpoint,
		Capabilities: agent.Capabilities,
		Metadata: &generated.AgentRegistration_Metadata{
			Version:          agent.Metadata["version"],
			Region:           agent.Metadata["region"],
			Labels:           labels,
			DefaultConfidence: agent.Confidence,
		},
	}

	client := generated.NewRegistryClient(s.client.conn)
	response, err := client.Register(ctx, &generated.RegisterRequest{
		Agent:     registration,
		AutoRenew: true,
	})
	if err != nil {
		return err
	}

	if response.LeaseId != "" {
		s.leases[agent.ID] = response.LeaseId
	}

	return nil
}

// List returns all registered agents
func (s *agentService) List(ctx context.Context) ([]*AgentInfo, error) {
	s.logger.Debug("Listing agents")

	client := generated.NewRegistryClient(s.client.conn)
	response, err := client.ListAgents(ctx, &generated.ListAgentsRequest{})
	if err != nil {
		return nil, err
	}

	agents := make([]*AgentInfo, 0, len(response.Agents))
	for _, agent := range response.Agents {
		agents = append(agents, agentFromRegistration(agent))
	}

	return agents, nil
}

// Get returns a specific agent by ID
func (s *agentService) Get(ctx context.Context, id string) (*AgentInfo, error) {
	s.logger.Debug("Getting agent", zap.String("id", id))

	client := generated.NewRegistryClient(s.client.conn)
	response, err := client.GetAgent(ctx, &generated.GetAgentRequest{AgentId: id})
	if err != nil {
		return nil, err
	}

	return agentFromRegistration(response), nil
}

// UpdateStatus updates an agent's status
func (s *agentService) UpdateStatus(ctx context.Context, id string, status AgentStatus) error {
	s.logger.Info("Updating agent status",
		zap.String("id", id),
		zap.String("status", string(status)),
	)

	return fmt.Errorf("update status is not supported by the registry API")
}

// UpdateConfidence updates an agent's confidence score
func (s *agentService) UpdateConfidence(ctx context.Context, id string, confidence float64) error {
	s.logger.Debug("Updating agent confidence",
		zap.String("id", id),
		zap.Float64("confidence", confidence),
	)
	
	if confidence < 0 || confidence > 1 {
		return fmt.Errorf("confidence must be between 0 and 1")
	}

	return fmt.Errorf("update confidence is not supported by the registry API")
}

// Heartbeat sends a heartbeat for an agent
func (s *agentService) Heartbeat(ctx context.Context, id string) error {
	s.logger.Debug("Sending heartbeat", zap.String("id", id))

	leaseId, ok := s.leases[id]
	if !ok {
		return fmt.Errorf("no lease found for agent %s", id)
	}

	client := generated.NewRegistryClient(s.client.conn)
	_, err := client.Renew(ctx, &generated.RenewRequest{LeaseId: leaseId})
	return err
}

// Unregister removes an agent from the system
func (s *agentService) Unregister(ctx context.Context, id string) error {
	s.logger.Info("Unregistering agent", zap.String("id", id))

	client := generated.NewRegistryClient(s.client.conn)
	_, err := client.Unregister(ctx, &generated.AgentRegistration{Id: id})
	if err == nil {
		delete(s.leases, id)
	}
	return err
}

// StreamAgents streams agent updates
func (s *agentService) StreamAgents(ctx context.Context) (<-chan *AgentInfo, error) {
	s.logger.Debug("Streaming agents")

	client := generated.NewRegistryClient(s.client.conn)
	stream, err := client.Watch(ctx, &generated.WatchRequest{
		IncludeInitial: true,
	})
	if err != nil {
		return nil, err
	}

	ch := make(chan *AgentInfo)
	go func() {
		defer close(ch)
		for {
			event, err := stream.Recv()
			if err != nil {
				return
			}
			if event.Agent == nil {
				continue
			}

			select {
			case ch <- agentFromRegistration(event.Agent):
			case <-ctx.Done():
				return
			}
		}
	}()

	return ch, nil
}

func agentFromRegistration(agent *generated.AgentRegistration) *AgentInfo {
	metadata := map[string]string{}
	if agent.GetMetadata() != nil {
		for key, value := range agent.Metadata.Labels {
			metadata[key] = value
		}
		if agent.Metadata.Version != "" {
			metadata["version"] = agent.Metadata.Version
		}
		if agent.Metadata.Region != "" {
			metadata["region"] = agent.Metadata.Region
		}
	}

	lastSeen := timeNow()
	if agent.RegisteredAt != nil {
		lastSeen = agent.RegisteredAt.AsTime()
	}

	defaultConfidence := 0.0
	if agent.GetMetadata() != nil {
		defaultConfidence = agent.Metadata.GetDefaultConfidence()
	}

	return &AgentInfo{
		ID:           agent.GetId(),
		Name:         agent.GetName(),
		Status:       AgentStatusActive,
		Capabilities: agent.GetCapabilities(),
		Endpoint:     agent.GetEndpoint(),
		LastSeen:     lastSeen,
		Confidence:   defaultConfidence,
		Metadata:     metadata,
	}
}
