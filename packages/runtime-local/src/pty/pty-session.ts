/**
 * PTY Session
 *
 * Manages a single pseudo-terminal session for a CLI agent.
 */

import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { v4 as uuid } from 'uuid';
import {
  AgentConfig,
  AgentHandle,
  AgentStatus,
  AgentMessage,
  CLIAdapter,
  BlockingPromptDetection,
  BlockingPromptInfo,
} from '@parallax/runtime-interface';
import { Logger } from 'pino';

export interface PTYSessionEvents {
  output: (data: string) => void;
  ready: () => void;
  login_required: (instructions?: string, url?: string) => void;
  blocking_prompt: (prompt: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: AgentMessage) => void;
  question: (question: string) => void;
  exit: (code: number) => void;
  error: (error: Error) => void;
}

export class PTYSession extends EventEmitter {
  private pty: pty.IPty | null = null;
  private outputBuffer: string = '';
  private _status: AgentStatus = 'pending';
  private _startedAt: Date | null = null;
  private _lastActivityAt: Date | null = null;
  private messageCounter: number = 0;

  public readonly id: string;

  constructor(
    private adapter: CLIAdapter,
    private config: AgentConfig,
    private logger: Logger
  ) {
    super();
    this.id = config.id || uuid();
  }

  get status(): AgentStatus {
    return this._status;
  }

  get pid(): number | undefined {
    return this.pty?.pid;
  }

  get startedAt(): Date | undefined {
    return this._startedAt ?? undefined;
  }

  get lastActivityAt(): Date | undefined {
    return this._lastActivityAt ?? undefined;
  }

  /**
   * Start the PTY session
   */
  async start(): Promise<void> {
    if (this.pty) {
      throw new Error('Session already started');
    }

    this._status = 'starting';
    this._startedAt = new Date();

    const command = this.adapter.getCommand();
    const args = this.adapter.getArgs(this.config);
    const adapterEnv = this.adapter.getEnv(this.config);

    const env = {
      ...process.env,
      ...adapterEnv,
      ...this.config.env,
      // Force some terminal settings
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    this.logger.info(
      { agentId: this.id, command, args: args.join(' ') },
      'Starting PTY session'
    );

    try {
      this.pty = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: this.config.workdir || process.cwd(),
        env: env as Record<string, string>,
      });

      this.setupEventHandlers();

      this.logger.info(
        { agentId: this.id, pid: this.pty.pid },
        'PTY session started'
      );
    } catch (error) {
      this._status = 'error';
      this.logger.error({ agentId: this.id, error }, 'Failed to start PTY session');
      throw error;
    }
  }

  /**
   * Set up event handlers for the PTY
   */
  private setupEventHandlers(): void {
    if (!this.pty) return;

    this.pty.onData((data) => {
      this._lastActivityAt = new Date();
      this.outputBuffer += data;

      // Emit raw output
      this.emit('output', data);

      // Check for blocking prompts (generalizes login detection)
      const blockingPrompt = this.detectAndHandleBlockingPrompt();
      if (blockingPrompt) {
        // Blocking prompt was detected and handled (or needs user intervention)
        return;
      }

      // Fallback: Check for login required (legacy support)
      const loginDetection = this.adapter.detectLogin(this.outputBuffer);
      if (loginDetection.required && this._status !== 'authenticating') {
        this._status = 'authenticating';
        this.emit('login_required', loginDetection.instructions, loginDetection.url);
        this.logger.warn(
          { agentId: this.id, loginType: loginDetection.type },
          'Login required'
        );
        return;
      }

      // Check for ready state
      if (this._status === 'starting' && this.adapter.detectReady(this.outputBuffer)) {
        this._status = 'ready';
        this.emit('ready');
        this.logger.info({ agentId: this.id }, 'Agent ready');
      }

      // Check for exit
      const exitDetection = this.adapter.detectExit(this.outputBuffer);
      if (exitDetection.exited) {
        this._status = 'stopped';
        this.emit('exit', exitDetection.code || 0);
      }

      // Try to parse output into structured message
      this.tryParseOutput();
    });

    this.pty.onExit(({ exitCode, signal }) => {
      this._status = 'stopped';
      this.logger.info(
        { agentId: this.id, exitCode, signal },
        'PTY session exited'
      );
      this.emit('exit', exitCode);
    });
  }

  /**
   * Detect blocking prompts and handle them with auto-responses or user notification
   * Returns true if a blocking prompt was detected and handled
   */
  private detectAndHandleBlockingPrompt(): boolean {
    // First, check adapter's auto-response rules
    const autoHandled = this.tryAutoResponse();
    if (autoHandled) {
      return true;
    }

    // Then check the adapter's detectBlockingPrompt method
    if (this.adapter.detectBlockingPrompt) {
      const detection = this.adapter.detectBlockingPrompt(this.outputBuffer);

      if (detection.detected) {
        const promptInfo: BlockingPromptInfo = {
          type: detection.type || 'unknown',
          prompt: detection.prompt,
          options: detection.options,
          canAutoRespond: detection.canAutoRespond || false,
          instructions: detection.instructions,
          url: detection.url,
        };

        // If we can auto-respond and have a suggested response, do it
        if (detection.canAutoRespond && detection.suggestedResponse) {
          this.logger.info(
            {
              agentId: this.id,
              promptType: detection.type,
              response: detection.suggestedResponse,
            },
            'Auto-responding to blocking prompt'
          );

          this.writeRaw(detection.suggestedResponse + '\r');
          this.emit('blocking_prompt', promptInfo, true);
          return true;
        }

        // Otherwise, notify that user intervention is needed
        if (detection.type === 'login') {
          this._status = 'authenticating';
        }

        this.logger.warn(
          {
            agentId: this.id,
            promptType: detection.type,
            prompt: detection.prompt,
          },
          'Blocking prompt requires user intervention'
        );

        this.emit('blocking_prompt', promptInfo, false);
        return true;
      }
    }

    return false;
  }

  /**
   * Try to match and apply auto-response rules
   * Returns true if an auto-response was applied
   */
  private tryAutoResponse(): boolean {
    const rules = this.adapter.autoResponseRules;
    if (!rules || rules.length === 0) {
      return false;
    }

    for (const rule of rules) {
      if (rule.pattern.test(this.outputBuffer)) {
        // Check if it's safe to auto-respond (default: true)
        const safe = rule.safe !== false;

        if (safe) {
          this.logger.info(
            {
              agentId: this.id,
              promptType: rule.type,
              description: rule.description,
              response: rule.response,
            },
            'Applying auto-response rule'
          );

          this.writeRaw(rule.response + '\r');

          // Clear the matched portion from buffer to prevent re-matching
          this.outputBuffer = this.outputBuffer.replace(rule.pattern, '');

          const promptInfo: BlockingPromptInfo = {
            type: rule.type,
            prompt: rule.description,
            canAutoRespond: true,
          };

          this.emit('blocking_prompt', promptInfo, true);
          return true;
        } else {
          // Not safe to auto-respond, emit for user intervention
          const promptInfo: BlockingPromptInfo = {
            type: rule.type,
            prompt: rule.description,
            canAutoRespond: false,
            instructions: `Prompt matched but requires user confirmation: ${rule.description}`,
          };

          this.emit('blocking_prompt', promptInfo, false);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Try to parse the output buffer into structured messages
   */
  private tryParseOutput(): void {
    const parsed = this.adapter.parseOutput(this.outputBuffer);

    if (parsed && parsed.isComplete) {
      // Clear the buffer for the parsed content
      this.outputBuffer = '';

      const message: AgentMessage = {
        id: `${this.id}-msg-${++this.messageCounter}`,
        agentId: this.id,
        direction: 'outbound',
        type: parsed.type,
        content: parsed.content,
        metadata: parsed.metadata,
        timestamp: new Date(),
      };

      this.emit('message', message);

      // Also emit specific event for questions
      if (parsed.isQuestion) {
        this.emit('question', parsed.content);
      }
    }
  }

  /**
   * Write data to the PTY (formatted by adapter)
   */
  write(data: string): void {
    if (!this.pty) {
      throw new Error('Session not started');
    }

    this._lastActivityAt = new Date();
    const formatted = this.adapter.formatInput(data);
    this.pty.write(formatted + '\r');

    this.logger.debug({ agentId: this.id, input: data }, 'Sent input to agent');
  }

  /**
   * Write raw data directly to the PTY (no formatting)
   * Used for terminal WebSocket pass-through
   */
  writeRaw(data: string): void {
    if (!this.pty) {
      throw new Error('Session not started');
    }

    this._lastActivityAt = new Date();
    this.pty.write(data);
  }

  /**
   * Send a task/message to the agent
   */
  send(message: string): AgentMessage {
    this._status = 'busy';

    const msg: AgentMessage = {
      id: `${this.id}-msg-${++this.messageCounter}`,
      agentId: this.id,
      direction: 'inbound',
      type: 'task',
      content: message,
      timestamp: new Date(),
    };

    this.write(message);

    return msg;
  }

  /**
   * Resize the PTY terminal
   */
  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, rows);
  }

  /**
   * Kill the PTY process
   */
  kill(signal?: string): void {
    if (this.pty) {
      this._status = 'stopping';
      this.pty.kill(signal);
      this.logger.info({ agentId: this.id, signal }, 'Killing PTY session');
    }
  }

  /**
   * Get current output buffer
   */
  getOutputBuffer(): string {
    return this.outputBuffer;
  }

  /**
   * Clear output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer = '';
  }

  /**
   * Convert to AgentHandle
   */
  toHandle(): AgentHandle {
    return {
      id: this.id,
      name: this.config.name,
      type: this.config.type,
      status: this._status,
      pid: this.pid,
      role: this.config.role,
      capabilities: this.config.capabilities,
      startedAt: this._startedAt ?? undefined,
      lastActivityAt: this._lastActivityAt ?? undefined,
    };
  }
}
