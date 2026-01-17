export * from './agent';
export * from './agent-base';
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

// Proto exports
export * from './proto';