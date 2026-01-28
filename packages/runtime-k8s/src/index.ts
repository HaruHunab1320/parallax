/**
 * Parallax Kubernetes Runtime
 *
 * K8s operator-based runtime for CLI agent pods.
 */

// Main runtime
export { K8sRuntime, K8sRuntimeOptions } from './k8s-runtime';

// Controller
export { AgentController, ControllerOptions } from './controllers/agent-controller';

// Server
export { RuntimeServer, RuntimeServerOptions } from './server';

// Re-export interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  RuntimeProvider,
} from '@parallax/runtime-interface';
