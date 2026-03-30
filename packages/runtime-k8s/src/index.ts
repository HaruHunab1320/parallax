/**
 * Parallax Kubernetes Runtime
 *
 * K8s operator-based runtime for CLI agent pods.
 */

// Re-export interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  RuntimeProvider,
} from '@parallaxai/runtime-interface';

// Controller
export {
  AgentController,
  ControllerOptions,
} from './controllers/agent-controller';
// Main runtime
export { K8sRuntime, K8sRuntimeOptions } from './k8s-runtime';
// Server
export { RuntimeServer, RuntimeServerOptions } from './server';
