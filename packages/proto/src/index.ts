// Re-export all generated proto types and services
export * from '../generated/confidence_pb';
export * from '../generated/confidence_grpc_pb';
export * from '../generated/registry_pb';
export * from '../generated/registry_grpc_pb';
export * from '../generated/patterns_pb';
export * from '../generated/patterns_grpc_pb';
export * from '../generated/coordinator_pb';
export * from '../generated/coordinator_grpc_pb';

// Export convenience types
export type { ConfidenceResult, AgentRequest, Capabilities, Health } from '../generated/confidence_pb';
export type { AgentRegistration, WatchEvent } from '../generated/registry_pb';
export type { Pattern, ExecutePatternRequest, ExecutePatternResponse } from '../generated/patterns_pb';
export type { CoordinateRequest, CoordinateResponse } from '../generated/coordinator_pb';