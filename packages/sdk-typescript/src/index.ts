export * from './agent';
export * from './agent-base';
export * from './executions';
export * from './patterns-client';
export * from './registry-client';
export * from './coordinator-client';
export * from './types';
export { 
  CoordinationPattern,
  ConfidenceProtocol,
  EpistemicOrchestrator,
  ConsensusBuilder,
  DEFAULT_THRESHOLDS,
  Agent
} from './patterns';
export * from './server';
export { SecureParallaxAgent, serveSecureAgent } from './secure-agent';
export { withConfidence, withConfidenceWrapper } from './confidence';

// Generated gRPC clients and types (preferred over manual types)
export * from './grpc-clients';

// Manual proto types (for compatibility - prefer generated types above)
// Note: Some types like AgentRequest, Capabilities, etc. are already exported from grpc-clients
export { HealthStatus } from './proto/types';
