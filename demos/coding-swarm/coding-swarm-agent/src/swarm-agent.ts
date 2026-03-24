/**
 * Swarm Agent
 *
 * Extends ParallaxAgent with thread lifecycle support for running
 * coding CLI agents as managed threads. This agent runs on Raspberry Pis
 * (or any machine) and connects to the control plane via the gateway.
 */

import * as grpc from '@grpc/grpc-js';
import { ParallaxAgent } from '@parallaxai/sdk-typescript';
import type { AgentResponse, GatewayThreadSpawnRequest, GatewayThreadInput, GatewayThreadStopRequest } from '@parallaxai/sdk-typescript';
import { ThreadExecutor } from './thread-executor';
import { TerminalRenderer } from './display/terminal-renderer';
import type { SwarmAgentConfig } from './config';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

export class SwarmAgent extends ParallaxAgent {
  private executor: ThreadExecutor;
  private display?: TerminalRenderer;

  constructor(private readonly config: SwarmAgentConfig) {
    super(
      `swarm-${config.id}`,
      `Coding Swarm: ${config.name}`,
      ['coding', 'threads', config.agentType],
      {
        type: 'coding-swarm-agent',
        agentType: config.agentType,
        device: config.device,
        agentName: config.id,
      }
    );

    this.executor = new ThreadExecutor(config.agentType, logger, {
      tmuxPrefix: config.tmuxPrefix,
      terminalCols: config.terminalCols,
      terminalRows: config.terminalRows,
    });
  }

  /**
   * Standard task handler (for non-thread tasks).
   * This agent is primarily thread-based, but can handle simple analysis tasks.
   */
  async analyze(task: string, _data?: any): Promise<AgentResponse> {
    return {
      value: {
        message: `Swarm agent ${this.config.id} received task but is designed for thread-based execution`,
        task,
      },
      confidence: 0.5,
      reasoning: 'This agent is optimized for long-running thread-based coding sessions, not one-shot analysis',
    };
  }

  /**
   * Handle thread spawn request from the control plane.
   * Creates a new coding CLI session via tmux-manager.
   */
  protected async handleGatewayThreadSpawn(
    stream: grpc.ClientDuplexStream<any, any>,
    requestId: string,
    request: GatewayThreadSpawnRequest
  ): Promise<void> {
    const { thread_id, adapter_type, task } = request;

    logger.info(
      { threadId: thread_id, adapterType: adapter_type, task: task.slice(0, 100) },
      'Spawning coding thread'
    );

    try {
      // Create display renderer for this thread's tmux session
      const sessionName = `${this.config.tmuxPrefix || 'swarm'}-${thread_id.slice(0, 8)}`;
      this.display = new TerminalRenderer(
        {
          agentName: this.config.name,
          agentType: adapter_type || this.config.agentType,
          tmuxSession: sessionName,
        },
        logger
      );

      // Spawn the thread
      const thread = await this.executor.spawn(
        {
          threadId: thread_id,
          adapterType: adapter_type || this.config.agentType,
          task,
          preparationJson: request.preparation_json,
          policyJson: request.policy_json,
          timeoutMs: request.timeout_ms,
        },
        (event) => this.emitThreadEvent(event),
        (update) => {
          this.emitThreadStatusUpdate(update);
          this.display?.updateStatus(update.status, update.summary);
        }
      );

      // Register for cleanup on disconnect
      this.registerThread(thread_id, () => {
        thread.cleanup();
        this.executor.stopThread(thread_id, true).catch(() => {});
      });

      // Configure display after session is created
      try {
        this.display.configure();
      } catch {
        // Display configuration is best-effort (may not have tmux on dev machines)
      }

      // Send success result
      stream.write({
        request_id: requestId,
        thread_spawn_result: {
          thread_id,
          success: true,
          adapter_type: adapter_type || this.config.agentType,
          workspace_dir: thread.sessionId, // Workspace dir is in the thread info
        },
      });

      logger.info({ threadId: thread_id }, 'Thread spawned successfully');
    } catch (error: any) {
      logger.error({ threadId: thread_id, error: error.message }, 'Failed to spawn thread');

      stream.write({
        request_id: requestId,
        thread_spawn_result: {
          thread_id,
          success: false,
          error_message: error.message || 'Unknown error spawning thread',
        },
      });
    }
  }

  /**
   * Handle thread input from the control plane.
   * Routes text to the running tmux session.
   */
  protected async handleGatewayThreadInput(request: GatewayThreadInput): Promise<void> {
    logger.debug({ threadId: request.thread_id, inputType: request.input_type }, 'Thread input received');
    this.executor.sendInput(request.thread_id, request.input);
  }

  /**
   * Handle thread stop request from the control plane.
   */
  protected async handleGatewayThreadStop(
    stream: grpc.ClientDuplexStream<any, any>,
    requestId: string,
    request: GatewayThreadStopRequest
  ): Promise<void> {
    logger.info({ threadId: request.thread_id, reason: request.reason, force: request.force }, 'Stopping thread');

    this.unregisterThread(request.thread_id);
    await this.executor.stopThread(request.thread_id, request.force);

    stream.write({
      request_id: requestId,
      thread_status_update: {
        thread_id: request.thread_id,
        status: 'completed',
        summary: `Thread stopped: ${request.reason}`,
        progress: 1.0,
        timestamp_ms: Date.now(),
      },
    });
  }

  /**
   * Shut down the agent and all threads.
   */
  async shutdown(): Promise<void> {
    await this.executor.shutdown();
    await super.shutdown();
  }
}
