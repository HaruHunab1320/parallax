/**
 * Parallax Docker Runtime
 *
 * Docker-based runtime for CLI agent containers.
 */

// Main runtime
export { DockerRuntime, DockerRuntimeOptions } from './docker-runtime';

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
