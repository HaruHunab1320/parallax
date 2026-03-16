/**
 * TypeScript interfaces for gateway thread protocol messages.
 * These mirror the proto definitions in gateway.proto for type-safe handling
 * in the SDK and subclass implementations.
 */

export interface GatewayThreadSpawnRequest {
  thread_id: string;
  adapter_type: string;
  task: string;
  preparation_json: string;
  policy_json: string;
  timeout_ms: number;
}

export interface GatewayThreadSpawnResult {
  thread_id: string;
  success: boolean;
  error_message?: string;
  adapter_type?: string;
  workspace_dir?: string;
}

export interface GatewayThreadEvent {
  thread_id: string;
  event_type: string;
  data_json: string;
  timestamp_ms: number;
  sequence: number;
}

export interface GatewayThreadInput {
  thread_id: string;
  input: string;
  input_type: string;
}

export interface GatewayThreadStopRequest {
  thread_id: string;
  reason: string;
  force: boolean;
}

export interface GatewayThreadStatusUpdate {
  thread_id: string;
  status: string;
  summary: string;
  progress: number;
  timestamp_ms: number;
}
