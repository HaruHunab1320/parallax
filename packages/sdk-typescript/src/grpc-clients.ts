/**
 * Re-exports of generated gRPC client types for use by other packages.
 * This provides type-safe client constructors for communicating with Parallax agents.
 */

// Export confidence agent client and types
export {
  ConfidenceAgentClient,
  ConfidenceAgentService,
  ConfidenceAgentServer,
  AgentRequest,
  ConfidenceResult,
  Capabilities,
  Health,
  Health_Status,
  health_StatusFromJSON,
  health_StatusToJSON,
  Empty,
} from '../generated/confidence';

// Export registry client and types
export {
  RegistryClient,
  RegistryService,
  RegistryServer,
  RegisterRequest,
  RegisterResponse,
  ListAgentsRequest,
  ListAgentsResponse,
  WatchRequest,
  WatchEvent,
  WatchEvent_EventType,
  watchEvent_EventTypeFromJSON,
  watchEvent_EventTypeToJSON,
  RenewRequest,
  GetAgentRequest,
  AgentRegistration,
} from '../generated/registry';

// Export coordinator client and types
export {
  CoordinatorClient,
  CoordinatorService,
  CoordinatorServer,
  CoordinateRequest,
  CoordinateRequest_Strategy,
  coordinateRequest_StrategyFromJSON,
  coordinateRequest_StrategyToJSON,
  CoordinateResponse,
  GetHistoryRequest,
  GetHistoryResponse,
} from '../generated/coordinator';

// Re-export google protobuf types commonly needed
export { Empty as GoogleEmpty } from '../generated/google/protobuf/empty';
export { Struct } from '../generated/google/protobuf/struct';
export { Timestamp } from '../generated/google/protobuf/timestamp';
