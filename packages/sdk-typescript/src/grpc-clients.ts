/**
 * Re-exports of generated gRPC client types for use by other packages.
 * This provides type-safe client constructors for communicating with Parallax agents.
 */

// Export confidence agent client and types
export {
  AgentRequest,
  Capabilities,
  ConfidenceAgentClient,
  ConfidenceAgentServer,
  ConfidenceAgentService,
  ConfidenceResult,
  Empty,
  Health,
  Health_Status,
  health_StatusFromJSON,
  health_StatusToJSON,
} from '../generated/confidence';
// Export coordinator client and types
export {
  CoordinateRequest,
  CoordinateRequest_Strategy,
  CoordinateResponse,
  CoordinatorClient,
  CoordinatorServer,
  CoordinatorService,
  coordinateRequest_StrategyFromJSON,
  coordinateRequest_StrategyToJSON,
  GetHistoryRequest,
  GetHistoryResponse,
} from '../generated/coordinator';
// Re-export google protobuf types commonly needed
export { Empty as GoogleEmpty } from '../generated/google/protobuf/empty';
export { Struct } from '../generated/google/protobuf/struct';
export { Timestamp } from '../generated/google/protobuf/timestamp';
// Export registry client and types
export {
  AgentRegistration,
  GetAgentRequest,
  ListAgentsRequest,
  ListAgentsResponse,
  RegisterRequest,
  RegisterResponse,
  RegistryClient,
  RegistryServer,
  RegistryService,
  RenewRequest,
  WatchEvent,
  WatchEvent_EventType,
  WatchRequest,
  watchEvent_EventTypeFromJSON,
  watchEvent_EventTypeToJSON,
} from '../generated/registry';
