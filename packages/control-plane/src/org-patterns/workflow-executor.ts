/**
 * Org-Chart Workflow Executor
 *
 * Executes workflows defined in org-chart patterns.
 */

import { combine } from '@_89/confidence-kernel';
import { EventEmitter } from 'node:events';
import type {
  AgentConfig,
  AgentMessage,
  ThreadHandle,
  ThreadWorkspaceRef,
} from '@parallaxai/runtime-interface';
import { sanitizeOutput } from 'adapter-types';
import type { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import type { AgentRuntimeService } from '../agent-runtime';
import type { ThreadPreparationService } from '../threads';
import { runLocalCommand } from './local-command-verifier';
import { MessageRouter } from './message-router';
import {
  parseReviewVerdict,
  REVIEW_PROTOCOL_INSTRUCTION,
} from './review-verdict';
import type {
  HistoryOracle,
  OrgAgentInstance,
  OrgExecutionContext,
  OrgPattern,
  OrgRole,
  OrgVerify,
  VerifyOracle,
  WorkflowStep,
} from './types';
import {
  normalizeVerification,
  validateOrgVerification,
} from './verification-validation';
import { abortable, LeafSemaphore } from './workflow-control';

export interface WorkflowExecutorOptions {
  /** Timeout for individual steps (ms) */
  stepTimeout?: number;

  /** Maximum parallel operations */
  maxParallel?: number;

  /** Trusted development only; production must use an isolated commandVerifier. */
  allowLocalCommandVerification?: boolean;

  /** Execute in an isolated worker with controlled environment and workspace. */
  commandVerifier?: (request: {
    executionId: string;
    role: string;
    command: string;
    cwd?: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

  /**
   * Backs the `history` verify oracle (see DecisionHistory). Without it,
   * history oracles resolve neutral.
   */
  decisionHistory?: {
    signal(
      query: { patternName: string; role: string; repo?: string },
      oracle: HistoryOracle
    ): Promise<{ confidence: number; detail?: string }>;
  };
}

export interface WorkflowExecutionOptions {
  executionId?: string;
  signal?: AbortSignal;
}

export type OracleStatus =
  | 'passed'
  | 'failed'
  | 'unavailable'
  | 'inconclusive'
  | 'skipped';
export interface OracleResult {
  status: OracleStatus;
  required: boolean;
  confidence: number;
  detail?: string;
}
interface VerificationSignal {
  confidence: number | undefined;
  source: string;
  detail?: string;
  requiredPassed?: boolean;
  oracles?: OracleResult[];
}

/** The resolved value from sendToThreadAndWait. */
export interface ThreadCompletionResult {
  threadId: string;
  result: string | ThreadHandle | null;
  summary: string;
  /** Confidence reported by the agent in its turn completion, if any. */
  confidence?: number;
}

/** Union of possible step result types. */
export type StepResult =
  | ThreadCompletionResult
  | AgentMessage
  | StepResult[]
  | string
  | null
  | undefined;

export interface WorkflowResult {
  /** Execution ID */
  executionId: string;

  /** Pattern name */
  patternName: string;

  /** Final output */
  output: StepResult;

  /** Execution metrics */
  metrics: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    stepsExecuted: number;
    agentsUsed: number;
  };

  /** Step results */
  steps: Array<{
    step: number;
    type: string;
    result: StepResult;
    durationMs: number;
  }>;
}

export class WorkflowExecutor extends EventEmitter {
  private stepTimeout: number;
  private maxParallel: number;
  private decisionHistory?: WorkflowExecutorOptions['decisionHistory'];
  private commandVerifier?: WorkflowExecutorOptions['commandVerifier'];
  private allowLocalCommandVerification: boolean;
  private cleanupFailures = new Map<string, unknown>();
  private executions = new Map<string, OrgExecutionContext>();
  private controls = new WeakMap<
    OrgExecutionContext,
    {
      controller: AbortController;
      leaves: LeafSemaphore;
      pendingSpawns: Set<Promise<unknown>>;
      lateCleanupErrors: unknown[];
      cleanup?: Promise<void>;
    }
  >();
  private readyChecks = new WeakMap<OrgExecutionContext, () => void>();
  private unitContexts = new WeakMap<OrgAgentInstance, OrgExecutionContext>();

  constructor(
    private runtimeService: AgentRuntimeService,
    private logger: Logger,
    options: WorkflowExecutorOptions & {
      threadPreparationService?: ThreadPreparationService;
    } = {}
  ) {
    super();
    this.stepTimeout = options.stepTimeout ?? 0; // 0 = no timeout
    this.maxParallel = options.maxParallel ?? 10;
    if (!Number.isInteger(this.maxParallel) || this.maxParallel < 1) {
      throw new Error('maxParallel must be a positive integer');
    }
    this.commandVerifier = options.commandVerifier;
    this.allowLocalCommandVerification =
      options.allowLocalCommandVerification === true;
    this.decisionHistory = options.decisionHistory;
  }

  /**
   * Execute an org-chart pattern workflow
   */
  async execute(
    pattern: OrgPattern,
    input: any,
    options: WorkflowExecutionOptions = {}
  ): Promise<WorkflowResult> {
    validateOrgVerification(pattern);
    options.signal?.throwIfAborted();
    const executionId = options.executionId ?? uuidv4();
    if (this.executions.has(executionId))
      throw new Error(`Execution ${executionId} already running`);
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const startedAt = new Date();

    this.logger.info(
      { executionId, pattern: pattern.name },
      'Starting org workflow execution'
    );

    // Create execution context
    const context: OrgExecutionContext = {
      id: executionId,
      signal: controller.signal,
      pattern,
      agents: new Map(),
      roleAssignments: new Map(),
      state: 'initializing',
      variables: new Map([['input', input]]),
      startedAt,
    };

    this.cleanupFailures.delete(executionId);
    this.executions.set(executionId, context);
    this.controls.set(context, {
      controller,
      leaves: new LeafSemaphore(this.maxParallel),
      pendingSpawns: new Set(),
      lateCleanupErrors: [],
    });
    const stepResults: WorkflowResult['steps'] = [];
    let unsubscribeMessages: (() => void) | null = null;

    try {
      // Boot phase: spawn ALL agents upfront so CLIs can boot in parallel.
      // Set up ready-event listeners BEFORE spawning so we don't miss
      // fast-booting agents whose ready event fires during the spawn sequence.
      const readyGate = this.createReadyGate(pattern.structure.roles, context);
      void readyGate.catch(() => {}); // Boot may fail before the gate is awaited.
      await this.initializeAgents(pattern.structure.roles, context);
      await readyGate;
      context.signal?.throwIfAborted();

      this.logger.info(
        { executionId, agentCount: context.agents.size },
        'All agents ready — starting workflow execution'
      );

      // Create message router
      const router = new MessageRouter(pattern.structure, context, this.logger);

      // Wire up router events
      this.setupRouterEvents(router, context);

      // Subscribe to agent messages and route based on org hierarchy
      // This enables sub-agents to communicate with their lead/manager
      unsubscribeMessages = this.subscribeToAgentMessages(context, router);

      context.state = 'running';

      // Execute workflow steps
      for (let i = 0; i < pattern.workflow.steps.length; i++) {
        const step = pattern.workflow.steps[i];
        const stepStart = Date.now();

        this.logger.debug(
          { executionId, step: i, type: step.type },
          'Executing step'
        );

        context.currentStep = i;
        const result = await this.executeStep(step, context, router);
        context.signal?.throwIfAborted();

        stepResults.push({
          step: i,
          type: step.type,
          result,
          durationMs: Date.now() - stepStart,
        });

        // Store every step's result so later steps can reference ${step_N_result}
        context.variables.set(`step_${i}_result`, result);
      }

      context.signal?.throwIfAborted();
      context.state = 'completed';

      // Cleanup message subscriptions
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }

      // All work must finish before completion; never leave execution units running.
      await this.cleanupAgents(context);
      context.signal?.throwIfAborted();

      const completedAt = new Date();
      const finalOutput = this.extractOutput(pattern.workflow.output, context);

      this.logger.info(
        {
          executionId,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        'Org workflow completed'
      );

      this.emit('workflow_completed', {
        executionId,
        patternName: pattern.name,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stepsExecuted: stepResults.length,
        agentsUsed: context.agents.size,
      });

      return {
        executionId,
        patternName: pattern.name,
        output: finalOutput,
        metrics: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          stepsExecuted: stepResults.length,
          agentsUsed: context.agents.size,
        },
        steps: stepResults,
      };
    } catch (error) {
      controller.abort(error);
      context.state = 'failed';

      this.logger.error(
        {
          executionId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Org workflow failed'
      );

      // Cleanup message subscriptions
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }

      // Cleanup agents
      let failure = error;
      await this.cleanupAgents(context).catch((cleanupError) => {
        this.logger.error(
          { executionId, cleanupError },
          'Workflow cleanup incomplete'
        );
        if (cleanupError !== error) {
          failure = new AggregateError(
            [error, cleanupError],
            `Workflow failed and runtime cleanup is incomplete; worker reconciliation required: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
          );
        }
      });

      this.emit('workflow_failed', {
        executionId,
        patternName: pattern.name,
        durationMs: Date.now() - startedAt.getTime(),
        stepsExecuted: stepResults.length,
        error: failure instanceof Error ? failure.message : String(failure),
      });

      throw failure;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      this.executions.delete(executionId);
      for (const unit of context.agents.values())
        this.unitSendChains.delete(unit.id);
    }
  }

  async cancelExecution(
    executionId: string,
    reason = new Error('Workflow cancelled')
  ): Promise<void> {
    const context = this.executions.get(executionId);
    if (!context) {
      const failure = this.cleanupFailures.get(executionId);
      if (failure) throw failure;
      return;
    }
    this.controls.get(context)?.controller.abort(reason);
    await this.cleanupAgents(context);
  }

  private assertActive(context?: OrgExecutionContext): void {
    context?.signal?.throwIfAborted();
    if (context?.state === 'completed' || context?.state === 'failed') {
      throw new Error(`Workflow ${context.id} is already ${context.state}`);
    }
  }

  /**
   * Initialize agents for all roles
   */
  private async initializeAgents(
    roles: Record<string, OrgRole>,
    context: OrgExecutionContext
  ): Promise<void> {
    // Spawn agents sequentially to ensure the gateway adapter's
    // "already has thread" check works correctly between spawns.
    // Parallel spawns race and can assign the wrong agent.
    for (const [roleId, role] of Object.entries(roles)) {
      const count = role.singleton ? 1 : role.minInstances || 1;

      for (let i = 0; i < count; i++) {
        await this.spawnAgentForRole(roleId, role, context, i);
      }
    }
  }

  /**
   * Create a ready gate that resolves when all agents report ready.
   * Must be called BEFORE initializeAgents so subscriptions catch
   * ready events that fire during the spawn sequence.
   *
   * Returns a promise that resolves when all agents are ready (or timeout).
   * The gate listens on the gateway service's thread event listeners directly
   * since the agents aren't spawned yet (no threadToRuntime mapping).
   */
  private createReadyGate(
    roles: Record<string, OrgRole>,
    context: OrgExecutionContext
  ): Promise<void> {
    const totalExpected = Object.values(roles)
      .filter((role) => role.threadConfig?.enabled)
      .reduce(
        (count, role) => count + (role.singleton ? 1 : role.minInstances || 1),
        0
      );
    if (totalExpected === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const events = new Map<string, { type: string; instructions?: string }>();
      const cleanup = () => {
        clearTimeout(timer);
        this.runtimeService.removeListener('thread_event', handler);
        context.signal?.removeEventListener('abort', abort);
        this.readyChecks.delete(context);
      };
      const abort = () => {
        cleanup();
        reject(context.signal?.reason ?? new Error('Workflow cancelled'));
      };
      const check = () => {
        const owned = [...context.agents.values()].filter(
          (unit) => unit.kind === 'thread'
        );
        const auth = owned
          .map((unit) => ({ unit, event: events.get(unit.id) }))
          .find(
            ({ event }) =>
              event?.type === 'thread_auth_required' ||
              event?.type === 'auth_required'
          );
        if (auth) {
          cleanup();
          reject(
            new Error(
              `Agent thread ${auth.unit.id} requires authentication and cannot become ready. ${auth.event?.instructions ?? 'Authenticate the agent CLI on the runtime host.'}`
            )
          );
        } else if (
          owned.length === totalExpected &&
          owned.every((unit) =>
            ['ready', 'thread_ready'].includes(events.get(unit.id)?.type ?? '')
          )
        ) {
          cleanup();
          resolve();
        }
      };
      const handler = (data: any) => {
        const event = data?.event ?? data;
        const id = event?.thread_id ?? event?.threadId;
        const type = event?.event_type ?? event?.type;
        if (
          !id ||
          ![
            'ready',
            'thread_ready',
            'thread_auth_required',
            'auth_required',
          ].includes(type)
        )
          return;
        events.set(id, { type, instructions: event?.data?.instructions });
        check();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Agents did not become ready within 120000ms`));
      }, 120000);
      this.readyChecks.set(context, check);
      this.runtimeService.on('thread_event', handler);
      context.signal?.addEventListener('abort', abort, { once: true });
      if (context.signal?.aborted) abort();
    });
  }

  /**
   * Spawn an agent for a role
   */
  private async spawnAgentForRole(
    roleId: string,
    role: OrgRole,
    context: OrgExecutionContext,
    index: number
  ): Promise<void> {
    this.assertActive(context);
    if (role.threadConfig?.enabled) {
      // Skip threadPreparationService — it provisions workspaces server-side.
      // Gateway agents clone repos locally via their thread executor.
      const spawnInput = {
        executionId: context.id,
        name: `${role.name} ${index + 1}`,
        agentType: Array.isArray(role.agentType)
          ? role.agentType[0]
          : role.agentType,
        // The role's standing objective (system-prompt-like) boots the
        // agent; per-step tasks are sent as follow-up messages. Fall back
        // to a role-derived line so the runtime always has a non-empty
        // objective.
        objective:
          role.threadConfig.objective?.trim() ||
          `You are the ${role.name} on this team.`,
        role: roleId,
        preparation: {
          workspace: (
            role.threadConfig.workspace as ThreadWorkspaceRef & {
              inherit?: boolean;
            }
          )?.inherit
            ? {
                ...(role.threadConfig.workspace || {}),
                repo: context.variables.get('input')?.repo,
                credentialsToken: context.variables.get('credentials')?.token,
              }
            : role.threadConfig.workspace,
          env: role.threadConfig.env,
          approvalPreset: role.threadConfig.approvalPreset,
        },
        workspace: role.threadConfig.workspace,
        env: role.threadConfig.env,
        approvalPreset: role.threadConfig.approvalPreset,
        metadata: {
          roleName: role.name,
          orgPattern: context.pattern.name,
          ...(role.threadConfig.metadata || {}),
        },
        policy: role.threadConfig.policy,
      };

      const thread = await this.waitForSpawn(
        this.runtimeService.spawnThread(spawnInput).then(async (thread) => {
          if (context.signal?.aborted) {
            await this.stopLateSpawn(
              () => this.runtimeService.stopThread(thread.id),
              context
            );
            context.signal.throwIfAborted();
          }
          this.registerRoleExecutionUnit(roleId, context, {
            id: thread.id,
            kind: 'thread',
            threadId: thread.id,
            role: roleId,
            endpoint: '',
            status: 'idle',
          });
          return thread;
        }),
        context
      );

      this.logger.debug(
        { threadId: thread.id, role: roleId },
        'Thread spawned for role'
      );
      return;
    }

    const agentType = Array.isArray(role.agentType)
      ? role.agentType[0]
      : role.agentType;

    const config: AgentConfig = {
      ...role.agentConfig,
      name: `${role.name} ${index + 1}`,
      type: agentType,
      capabilities: role.capabilities,
      role: roleId,
      executionId: context.id,
    };

    const handle = await this.waitForSpawn(
      this.runtimeService.spawn(config).then(async (handle) => {
        if (context.signal?.aborted) {
          await this.stopLateSpawn(
            () => this.runtimeService.stop(handle.id),
            context
          );
          context.signal.throwIfAborted();
        }
        this.registerRoleExecutionUnit(roleId, context, {
          id: handle.id,
          kind: 'agent',
          role: roleId,
          endpoint: handle.endpoint || '',
          status: 'idle',
        });
        return handle;
      }),
      context
    );

    this.logger.debug(
      { agentId: handle.id, role: roleId },
      'Agent spawned for role'
    );
  }

  private async stopLateSpawn(
    stop: () => Promise<void>,
    context: OrgExecutionContext
  ): Promise<void> {
    try {
      await stop();
    } catch (error) {
      this.controls.get(context)?.lateCleanupErrors.push(error);
      throw error;
    }
  }

  private waitForSpawn<T>(
    spawn: Promise<T>,
    context: OrgExecutionContext
  ): Promise<T> {
    const pending = this.controls.get(context)?.pendingSpawns;
    pending?.add(spawn);
    void spawn.then(
      () => pending?.delete(spawn),
      () => pending?.delete(spawn)
    );
    return abortable(spawn, context.signal);
  }

  private registerRoleExecutionUnit(
    roleId: string,
    context: OrgExecutionContext,
    instance: OrgAgentInstance
  ): void {
    this.assertActive(context);
    this.unitContexts.set(instance, context);
    context.agents.set(instance.id, instance);
    this.readyChecks.get(context)?.();

    const assignments = context.roleAssignments.get(roleId) || [];
    assignments.push(instance.id);
    context.roleAssignments.set(roleId, assignments);
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<StepResult> {
    this.assertActive(context);
    const leaves = this.controls.get(context)?.leaves;
    if (
      leaves &&
      ['assign', 'review', 'approve', 'select', 'aggregate'].includes(step.type)
    ) {
      return leaves.run(
        () => this.executeLeafStep(step, context, router),
        context.signal
      );
    }
    return this.executeLeafStep(step, context, router);
  }

  private async executeLeafStep(
    step: WorkflowStep,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<StepResult> {
    this.assertActive(context);
    switch (step.type) {
      case 'assign':
        return this.executeAssignStep(step, context);

      case 'parallel':
        return this.executeParallelStep(step, context, router);

      case 'sequential':
        return this.executeSequentialStep(step, context, router);

      case 'select':
        return this.executeSelectStep(step, context);

      case 'review':
        return this.executeReviewStep(step, context);

      case 'approve':
        return this.executeApproveStep(step, context);

      case 'aggregate':
        return this.executeAggregateStep(step, context);

      case 'condition':
        return this.executeConditionStep(step, context, router);

      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }
  }

  /**
   * Execute an assign step - send task to a role
   */
  private async executeAssignStep(
    step: Extract<WorkflowStep, { type: 'assign' }>,
    context: OrgExecutionContext
  ): Promise<StepResult> {
    const role = context.pattern.structure.roles[step.role];
    if (!role) {
      throw new Error(`Role ${step.role} not found in pattern`);
    }

    const agent = await this.getOrSpawnRoleUnit(step.role, role, context, {
      claim: true,
    });

    // Resolve variables in both task description and input
    const resolvedTask = this.resolveVariables(step.task, context);
    const taskStr =
      typeof resolvedTask === 'string'
        ? resolvedTask
        : JSON.stringify(resolvedTask);

    agent.status = 'busy';
    agent.currentTask = taskStr;

    const input = this.resolveVariables(step.input, context);

    let response = await this.sendToExecutionUnit(agent, taskStr, input);

    if (role.confidence || role.verify) {
      response = await this.applyConfidencePolicy(
        role,
        agent,
        taskStr,
        response,
        context
      );
    }

    agent.status = 'idle';
    agent.currentTask = undefined;

    return response;
  }

  /**
   * Get an execution unit for a role, spawning on demand.
   *
   * Prefers an idle instance; with `claim`, the selection and the busy
   * mark happen synchronously (no await between them) so concurrent
   * parallel assigns distribute across a role's instances instead of
   * stacking on the first one (sends to a single unit are serialized,
   * so stacking would run "parallel" work sequentially).
   */
  private async getOrSpawnRoleUnit(
    roleId: string,
    role: OrgRole,
    context: OrgExecutionContext,
    options: { claim?: boolean } = {}
  ): Promise<OrgAgentInstance> {
    let agentIds = context.roleAssignments.get(roleId);
    if (!agentIds || agentIds.length === 0) {
      this.logger.info(
        { role: roleId },
        'Spawning agent on-demand for workflow step'
      );
      await this.spawnAgentForRole(roleId, role, context, 0);
      agentIds = context.roleAssignments.get(roleId);
    }

    if (!agentIds || agentIds.length === 0) {
      throw new Error(`Failed to spawn agent for role: ${roleId}`);
    }

    const units = agentIds
      .map((id) => context.agents.get(id))
      .filter((u): u is OrgAgentInstance => !!u);
    if (units.length === 0) {
      throw new Error(`Agent ${agentIds[0]} not found after spawn`);
    }

    const unit = units.find((u) => u.status !== 'busy') ?? units[0];
    if (options.claim) {
      unit.status = 'busy';
    }
    return unit;
  }

  /**
   * Confidence signal carried by a step result, if any.
   */
  private extractConfidence(response: StepResult): number | undefined {
    if (
      response == null ||
      typeof response === 'string' ||
      Array.isArray(response)
    ) {
      return undefined;
    }
    const confidence = (response as { confidence?: unknown }).confidence;
    if (typeof confidence === 'number') return confidence;
    const meta = (response as { metadata?: Record<string, unknown> }).metadata;
    if (meta && typeof meta.confidence === 'number') return meta.confidence;
    return undefined;
  }

  /**
   * The confidence signal for a step result. Prefers the role's `verify`
   * oracle (verification-driven, per docs/CONFIDENCE.md); falls back to the
   * agent's self-reported marker (a weak supplement).
   */
  private async signalFor(
    role: OrgRole,
    response: StepResult,
    context: OrgExecutionContext,
    task?: string
  ): Promise<VerificationSignal> {
    if (role.verify) {
      return this.runVerify(role.verify, role, context, response, task);
    }
    return {
      confidence: this.extractConfidence(response),
      source: 'selfreport',
    };
  }

  /**
   * Confidence routes bounded repair attempts. Required evidence is a separate
   * gate: the current attempt must pass, including after a supervisor correction.
   */
  private async applyConfidencePolicy(
    role: OrgRole,
    unit: OrgAgentInstance,
    taskStr: string,
    initialResponse: StepResult,
    context: OrgExecutionContext
  ): Promise<StepResult> {
    const policy = role.confidence ?? {
      accept: 0.8,
      retryBelow: 0.6,
      escalateBelow: 0.4,
    };
    const accept = policy.accept ?? 0.8;
    let response = initialResponse;
    let signal = await this.signalFor(role, response, context, taskStr);
    const emit = (action: string, extra: Record<string, unknown> = {}) =>
      this.emit('step_confidence', {
        executionId: context.id,
        step: context.currentStep,
        role: role.id,
        action,
        confidence: signal.confidence,
        source: signal.source,
        detail: signal.detail,
        requiredPassed: signal.requiredPassed,
        oracles: signal.oracles,
        ...extra,
      });
    const blocked = () => signal.requiredPassed === false;
    if (signal.confidence === undefined) {
      emit('no_signal');
      return response;
    }

    if (
      policy.retryBelow !== undefined &&
      signal.confidence < policy.retryBelow &&
      (policy.escalateBelow === undefined ||
        signal.confidence >= policy.escalateBelow)
    ) {
      emit('retry');
      response = await this.sendToExecutionUnit(
        unit,
        `Your previous attempt did not pass verification.\n\nWhat failed:\n${signal.detail ?? signal.confidence}\n\n` +
          `Fix the problems and provide an improved result.\n\nOriginal task: ${taskStr}\n\n` +
          `Your previous result:\n${this.extractResponseText(response)}`
      );
      // The workspace has changed; an earlier passing score cannot validate this attempt.
      signal = await this.signalFor(role, response, context, taskStr);
    }

    if (
      blocked() ||
      (policy.escalateBelow !== undefined &&
        (signal.confidence ?? 0) < policy.escalateBelow)
    ) {
      const supervisorId = role.reportsTo;
      const supervisorRole = supervisorId
        ? context.pattern.structure.roles[supervisorId]
        : undefined;
      if (!supervisorId || !supervisorRole) {
        emit('escalation_unrouted');
        if (blocked())
          throw new Error(
            `Required verification failed for ${role.id}: ${signal.detail}`
          );
        return response; // A self-report or historical prior alone is advisory.
      }
      emit('escalate', { supervisor: supervisorId });
      const supervisor = await this.getOrSpawnRoleUnit(
        supervisorId,
        supervisorRole,
        context
      );
      response = await this.sendToExecutionUnit(
        supervisor,
        `Your report (${role.name}) completed a task that did not pass verification ` +
          `(confidence ${(signal.confidence ?? 0).toFixed(2)}).\n\nVerification detail:\n${signal.detail ?? ''}\n\n` +
          `Task: ${taskStr}\n\nTheir result:\n${this.extractResponseText(response)}\n\n` +
          'Correct the work in the original workspace and provide the corrected result. Required checks will run again.'
      );
      if (signal.oracles?.some((oracle) => oracle.required)) {
        // Exactly one escalation; the supervisor cannot waive the original checks.
        signal = await this.signalFor(role, response, context, taskStr);
        if (signal.requiredPassed === false) {
          emit('verification_failed');
          throw new Error(
            `Required verification failed after escalation for ${role.id}: ${signal.detail}`
          );
        }
      } else return response;
    }
    this.assertActive(context);
    emit((signal.confidence ?? 0) >= accept ? 'accept' : 'accept_with_warning');
    return response;
  }

  /**
   * Run a role's verification and produce a confidence signal. First slice:
   * the `command` oracle only (docs/VERIFY.md). Multiple oracles combine by
   * minimum confidence (a result is only as trustworthy as its weakest check).
   */
  private async runVerify(
    verify: VerifyOracle | VerifyOracle[] | OrgVerify,
    role: OrgRole,
    context: OrgExecutionContext,
    subject: StepResult,
    task?: string
  ): Promise<VerificationSignal> {
    const spec = normalizeVerification(verify);
    const results: OracleResult[] = [];
    // Sequential checks preserve an intelligible evidence order and the leaf-work bound.
    for (const oracle of spec.oracles) {
      this.assertActive(context);
      results.push(await this.runOracle(oracle, role, context, subject, task));
    }
    this.assertActive(context);
    return {
      confidence: combine(results, 'min').confidence,
      requiredPassed: results
        .filter((result) => result.required)
        .every((result) => result.status === 'passed'),
      oracles: results,
      source: spec.oracles.map((oracle) => oracle.type).join('+'),
      detail: results
        .map((result) => result.detail)
        .filter(Boolean)
        .join('\n'),
    };
  }

  private async runOracle(
    oracle: VerifyOracle,
    role: OrgRole,
    context: OrgExecutionContext,
    subject: StepResult,
    task?: string
  ): Promise<OracleResult> {
    if (oracle.type === 'history')
      return this.runHistoryOracle(oracle, role, context);
    if (oracle.type === 'agent')
      return this.runAgentOracle(oracle, role, context, subject, task);
    if (oracle.type !== 'command') {
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail: 'Unsupported verification oracle',
      };
    }
    if (
      !this.commandVerifier &&
      (!this.allowLocalCommandVerification ||
        process.env.NODE_ENV === 'production')
    ) {
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail:
          'Command verification requires an isolated commandVerifier. Trusted development may explicitly enable allowLocalCommandVerification outside production.',
      };
    }
    const cwdRaw = oracle.cwd
      ? this.resolveVariables(oracle.cwd, context)
      : undefined;
    if (oracle.cwd && (typeof cwdRaw !== 'string' || !cwdRaw.trim())) {
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail: 'Verification working directory did not resolve',
      };
    }
    const cwd = typeof cwdRaw === 'string' ? cwdRaw : undefined;
    const timeoutMs = oracle.timeoutMs ?? 120000;
    try {
      let result: { exitCode: number; stdout: string; stderr: string };
      if (this.commandVerifier) {
        const controller = new AbortController();
        const abort = () => controller.abort(context.signal?.reason);
        context.signal?.addEventListener('abort', abort, { once: true });
        if (context.signal?.aborted) abort();
        const timer = setTimeout(
          () =>
            controller.abort(
              new Error(`Command verification timed out after ${timeoutMs}ms`)
            ),
          timeoutMs
        );
        try {
          result = await abortable(
            this.commandVerifier({
              executionId: context.id,
              role: role.id,
              command: oracle.run,
              cwd,
              timeoutMs,
              signal: controller.signal,
            }),
            controller.signal
          );
        } finally {
          clearTimeout(timer);
          context.signal?.removeEventListener('abort', abort);
        }
      } else {
        result = await runLocalCommand(
          oracle.run,
          cwd,
          timeoutMs,
          context.signal
        );
      }
      this.assertActive(context);
      if (
        !Number.isInteger(result.exitCode) ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string'
      ) {
        throw new Error('Verifier returned an invalid command result');
      }
      const output = `${result.stdout}\n${result.stderr}`;
      let score: number | undefined;
      if (oracle.scorePattern) {
        const match = output.match(new RegExp(oracle.scorePattern));
        const passed = Number(match?.[1]);
        const failed = Number(match?.[2]);
        if (
          Number.isFinite(passed) &&
          Number.isFinite(failed) &&
          passed >= 0 &&
          failed >= 0 &&
          passed + failed > 0
        ) {
          score = passed / (passed + failed);
        }
      }
      const status: OracleStatus =
        result.exitCode !== 0 || (score !== undefined && score < 1)
          ? 'failed'
          : oracle.scorePattern && score === undefined
            ? 'inconclusive'
            : 'passed';
      return {
        status,
        required: true,
        confidence:
          score ??
          (status === 'passed'
            ? (oracle.passConfidence ?? 1)
            : (oracle.failConfidence ?? 0)),
        detail: `\`${oracle.run}\` — ${status}${score !== undefined ? ` (${(score * 100).toFixed(0)}%)` : ''}\n${output.slice(-800)}`,
      };
    } catch (error) {
      context.signal?.throwIfAborted();
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail: `Command verification unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * The `agent` oracle (tier 3): a reviewer role judges the output
   * against the original task and returns a structured verdict the
   * executor parses into confidence. Unlike self-authored tests, this
   * verifies the work against what was ASKED — it exists because the
   * 2026-07-20 run proved engineers can pass their own suites at 1.0
   * while silently dropping requirements (see docs/experiments/).
   *
   * Missing or broken reviewers and unparseable verdicts block acceptance.
   * Confidence is a triage signal; only an explicit approve passes the gate.
   */
  private async runAgentOracle(
    oracle: Extract<VerifyOracle, { type: 'agent' }>,
    role: OrgRole,
    context: OrgExecutionContext,
    subject: StepResult,
    task?: string
  ): Promise<OracleResult> {
    const reviewerId = oracle.role ?? role.reportsTo;
    const reviewerRole = reviewerId
      ? context.pattern.structure.roles[reviewerId]
      : undefined;

    if (!reviewerId || !reviewerRole) {
      this.logger.warn(
        { role: role.id, reviewer: oracle.role ?? '(reportsTo unset)' },
        'Agent oracle configured but no reviewer role available'
      );
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail: 'agent review — no reviewer role available',
      };
    }

    try {
      const reviewer = await this.getOrSpawnRoleUnit(
        reviewerId,
        reviewerRole,
        context
      );

      const prompt =
        `Review the following completed work from ${role.name}.\n\n` +
        (oracle.rubric ? `Rubric: ${oracle.rubric}\n\n` : '') +
        `Task they were given:\n${task ?? '(task text unavailable)'}\n\n` +
        `Their reported result:\n` +
        `${this.extractResponseText(subject).slice(0, 6000)}\n\n` +
        'Verify their claims against reality where possible (files on ' +
        'disk, running their tests). Watch specifically for silently ' +
        'dropped requirements, skipped tests, and pieces that do not ' +
        'compose.\n\n' +
        REVIEW_PROTOCOL_INSTRUCTION;

      const response = await this.sendToExecutionUnit(reviewer, prompt);
      const text = this.extractResponseText(response);
      const parsed = parseReviewVerdict(text);

      if (!parsed.verdict || parsed.confidence === undefined) {
        this.logger.warn(
          { role: role.id, reviewer: reviewerId },
          'Agent oracle reply carried no parseable verdict'
        );
        return {
          status: 'inconclusive',
          required: true,
          confidence: 0,
          detail: `agent review (${reviewerId}) — no parseable verdict`,
        };
      }

      return {
        status: parsed.verdict === 'approve' ? 'passed' : 'failed',
        required: true,
        confidence: parsed.confidence,
        detail:
          `agent review (${reviewerId}): ${parsed.verdict ?? 'no verdict word'} ` +
          `(${parsed.confidence.toFixed(2)})\n${parsed.detail.slice(-600)}`,
      };
    } catch (error) {
      context.signal?.throwIfAborted();
      this.logger.warn(
        {
          role: role.id,
          reviewer: reviewerId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Agent oracle review turn failed'
      );
      return {
        status: 'unavailable',
        required: true,
        confidence: 0,
        detail: `agent review (${reviewerId}) — review turn failed`,
      };
    }
  }

  /**
   * The `history` oracle: a prior from the decision journal. Resolves
   * neutral (1.0) when no store is configured or the lookup fails — a
   * missing prior must never gate a step.
   */
  private async runHistoryOracle(
    oracle: HistoryOracle,
    role: OrgRole,
    context: OrgExecutionContext
  ): Promise<OracleResult> {
    if (!this.decisionHistory) {
      this.logger.warn(
        { role: role.id },
        'History oracle configured but no decision history store wired — neutral'
      );
      return {
        status: 'skipped',
        required: false,
        confidence: 1.0,
        detail: 'history — no decision history store configured: neutral',
      };
    }
    try {
      // `repo` is one of the sibling dimensions the oracle can pool over
      // (see DecisionHistory.scorePooled); undefined when no workspace is
      // attached, which simply drops that dimension.
      const input = context.variables.get('input');
      const repo = input?.workspace?.repo ?? input?.repo;
      const signal = await abortable(
        this.decisionHistory.signal(
          {
            patternName: context.pattern.name,
            role: role.id,
            repo: typeof repo === 'string' ? repo : undefined,
          },
          oracle
        ),
        context.signal
      );
      return { ...signal, status: 'skipped', required: false };
    } catch (error) {
      context.signal?.throwIfAborted();
      this.logger.warn(
        {
          role: role.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'History oracle lookup failed — neutral'
      );
      return {
        status: 'skipped',
        required: false,
        confidence: 1.0,
        detail: 'history — lookup failed: neutral',
      };
    }
  }

  /**
   * Execute parallel steps
   */
  private async executeParallelStep(
    step: Extract<WorkflowStep, { type: 'parallel' }>,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<StepResult[]> {
    const results = await Promise.allSettled(
      step.steps.map(async (child) => {
        try {
          return await this.executeStep(child, context, router);
        } catch (error) {
          this.controls.get(context)?.controller.abort(error);
          throw error;
        }
      })
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    return results.map(
      (result) => (result as PromiseFulfilledResult<StepResult>).value
    );
  }

  /**
   * Execute sequential steps
   */
  private async executeSequentialStep(
    step: Extract<WorkflowStep, { type: 'sequential' }>,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];
    for (const s of step.steps) {
      const result = await this.executeStep(s, context, router);
      results.push(result);
    }
    return results;
  }

  /**
   * Select an agent from a role
   */
  private async executeSelectStep(
    step: Extract<WorkflowStep, { type: 'select' }>,
    context: OrgExecutionContext
  ): Promise<string> {
    const agentIds = context.roleAssignments.get(step.role);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for role: ${step.role}`);
    }

    switch (step.criteria) {
      case 'availability': {
        const available = agentIds.find((id) => {
          const agent = context.agents.get(id);
          return agent?.status === 'idle';
        });
        return available || agentIds[0];
      }

      case 'round_robin': {
        // Simple round-robin based on current step
        const index = (context.currentStep || 0) % agentIds.length;
        return agentIds[index];
      }

      default:
        return agentIds[0];
    }
  }

  /**
   * Execute a review step
   */
  private async executeReviewStep(
    step: Extract<WorkflowStep, { type: 'review' }>,
    context: OrgExecutionContext
  ): Promise<StepResult> {
    const agentIds = context.roleAssignments.get(step.reviewer);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for reviewer role: ${step.reviewer}`);
    }

    const reviewerId = agentIds[0];
    const reviewer = context.agents.get(reviewerId);
    if (!reviewer) {
      throw new Error(`Reviewer ${reviewerId} not found`);
    }
    const subject = this.resolveVariables(step.subject, context);

    const response = await this.sendToExecutionUnit(
      reviewer,
      `Please review the following:\n\n${JSON.stringify(subject, null, 2)}\n\n` +
        REVIEW_PROTOCOL_INSTRUCTION
    );

    // Standalone review is an acceptance gate as well as a triage signal.
    const verdict = parseReviewVerdict(this.extractResponseText(response));
    if (verdict.confidence !== undefined) {
      this.emit('step_confidence', {
        executionId: context.id,
        step: context.currentStep,
        role: step.reviewer,
        action: 'review_verdict',
        confidence: verdict.confidence,
        source: 'review',
        status:
          verdict.verdict === 'approve'
            ? 'passed'
            : verdict.verdict
              ? 'failed'
              : 'inconclusive',
        detail: verdict.verdict,
      });
    }

    if (verdict.verdict !== 'approve')
      throw new Error(
        `Required review ${step.reviewer} did not approve: ${verdict.verdict ?? 'no parseable verdict'}`
      );
    return response;
  }

  /**
   * Execute an approval step
   */
  private async executeApproveStep(
    step: Extract<WorkflowStep, { type: 'approve' }>,
    context: OrgExecutionContext
  ): Promise<StepResult> {
    const agentIds = context.roleAssignments.get(step.approver);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for approver role: ${step.approver}`);
    }

    const approverId = agentIds[0];
    const approver = context.agents.get(approverId);
    if (!approver) {
      throw new Error(`Approver ${approverId} not found`);
    }
    const subject = this.resolveVariables(step.subject, context);

    const response = await this.sendToExecutionUnit(
      approver,
      `Please approve or reject the following:\n\n${JSON.stringify(subject, null, 2)}\n\n${REVIEW_PROTOCOL_INSTRUCTION}`
    );
    const verdict = parseReviewVerdict(this.extractResponseText(response));
    if (verdict.verdict !== 'approve')
      throw new Error(
        `Required approval ${step.approver} did not approve: ${verdict.verdict ?? 'no parseable verdict'}`
      );
    return response;
  }

  /**
   * Execute an aggregation step
   */
  private async executeAggregateStep(
    step: Extract<WorkflowStep, { type: 'aggregate' }>,
    context: OrgExecutionContext
  ): Promise<StepResult> {
    // Get results from previous parallel step
    const lastStepIndex = (context.currentStep || 1) - 1;
    const previousResults = context.variables.get(
      `step_${lastStepIndex}_result`
    );

    if (!Array.isArray(previousResults)) {
      return previousResults;
    }

    switch (step.method) {
      case 'consensus': {
        // Find most common result
        const counts = new Map<string, number>();
        for (const r of previousResults) {
          const key = JSON.stringify(r);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        let maxCount = 0;
        let consensus = null;
        for (const [key, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            consensus = JSON.parse(key);
          }
        }
        return consensus;
      }

      case 'majority': {
        // Return result if majority agrees
        const total = previousResults.length;
        const required = Math.ceil(total / 2);
        const majorityMap = new Map<string, number>();
        for (const r of previousResults) {
          const key = JSON.stringify(r);
          const count = (majorityMap.get(key) || 0) + 1;
          majorityMap.set(key, count);
          if (count >= required) {
            return JSON.parse(key);
          }
        }
        return null;
      }

      case 'merge':
        // Merge all results
        if (previousResults.every((r) => typeof r === 'object')) {
          return Object.assign({}, ...previousResults);
        }
        return previousResults;

      case 'best':
        // Return result with highest confidence
        return previousResults.reduce((best, current) => {
          const bestConf = best?.confidence || 0;
          const currConf = current?.confidence || 0;
          return currConf > bestConf ? current : best;
        }, previousResults[0]);

      default:
        return previousResults;
    }
  }

  /**
   * Execute a conditional step
   */
  private async executeConditionStep(
    step: Extract<WorkflowStep, { type: 'condition' }>,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<StepResult> {
    // Evaluate condition (simple variable check for now)
    const condition = this.resolveVariables(step.check, context);

    if (condition) {
      return this.executeStep(step.then, context, router);
    } else if (step.else) {
      return this.executeStep(step.else, context, router);
    }

    return null;
  }

  /**
   * Setup event handlers for the message router
   */
  private setupRouterEvents(
    router: MessageRouter,
    context: OrgExecutionContext
  ): void {
    router.on('send_question', async ({ toAgentId, question }) => {
      const target = context.agents.get(toAgentId);
      if (!target) {
        this.logger.warn({ toAgentId }, 'Question target not found');
        return;
      }

      try {
        await this.sendToExecutionUnit(
          target,
          `Question: ${question.question}\nContext: ${JSON.stringify(question.context)}`
        );
      } catch (error) {
        this.logger.error({ error, toAgentId }, 'Failed to send question');
      }
    });

    router.on('send_answer', async ({ toAgentId, answer }) => {
      const target = context.agents.get(toAgentId);
      if (!target) {
        this.logger.warn({ toAgentId }, 'Answer target not found');
        return;
      }

      try {
        await this.sendToExecutionUnit(
          target,
          `Answer to your question: ${answer.answer}`
        );
      } catch (error) {
        this.logger.error({ error, toAgentId }, 'Failed to send answer');
      }
    });

    router.on('surface_to_user', ({ question, reason }) => {
      this.emit('user_question', {
        executionId: context.id,
        question,
        reason,
      });
    });
  }

  /**
   * Subscribe to messages from all agents and route based on org hierarchy.
   *
   * When an agent sends a message, it gets routed to whoever they reportsTo.
   * The receiving agent (typically a lead/manager) responds naturally as an LLM.
   * No question detection needed - the LLM understands context.
   */
  private subscribeToAgentMessages(
    context: OrgExecutionContext,
    router: MessageRouter
  ): () => void {
    const unsubscribers: Array<() => void> = [];

    for (const [agentId, agentInstance] of context.agents) {
      const unsubscribe =
        agentInstance.kind === 'thread' && agentInstance.threadId
          ? this.runtimeService.subscribeThread(
              agentInstance.threadId,
              async (event) => {
                if (event.type !== 'thread_output') return;

                const content =
                  typeof event.data?.message === 'object' &&
                  event.data?.message &&
                  'content' in (event.data.message as Record<string, unknown>)
                    ? String(
                        (event.data.message as Record<string, unknown>).content
                      )
                    : undefined;

                if (!content) return;

                await this.routeExecutionUnitMessage(
                  agentId,
                  agentInstance,
                  content,
                  context,
                  router
                );
              }
            )
          : this.runtimeService.subscribe(agentId, async (message) => {
              await this.routeExecutionUnitMessage(
                agentId,
                agentInstance,
                message.content,
                context,
                router
              );
            });

      unsubscribers.push(unsubscribe);
    }

    // Return function to unsubscribe all
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }

  private async routeExecutionUnitMessage(
    agentId: string,
    agentInstance: OrgAgentInstance,
    content: string,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<void> {
    if (
      context.signal?.aborted ||
      context.state === 'completed' ||
      context.state === 'failed'
    )
      return;
    // Find who this agent reports to
    const role = context.pattern.structure.roles[agentInstance.role];
    if (!role?.reportsTo) {
      // Top-level agent (lead) - surface to user or handle as final output
      this.logger.debug(
        { agentId, role: agentInstance.role },
        'Message from top-level agent (no reportsTo)'
      );
      this.emit('lead_agent_message', {
        executionId: context.id,
        agentId,
        role: agentInstance.role,
        message: { content },
      });
      return;
    }

    // Find the manager agent(s) for this role
    const managerAgentIds = context.roleAssignments.get(role.reportsTo) || [];
    if (managerAgentIds.length === 0) {
      this.logger.warn(
        { agentId, role: agentInstance.role, reportsTo: role.reportsTo },
        'No manager agent found for reportsTo role'
      );
      return;
    }

    // Route message to the manager (first available)
    const managerId = managerAgentIds[0];

    this.logger.debug(
      {
        fromAgentId: agentId,
        toAgentId: managerId,
        fromRole: agentInstance.role,
        toRole: role.reportsTo,
      },
      'Routing agent message to manager'
    );

    try {
      const manager = context.agents.get(managerId);
      if (!manager) {
        this.logger.warn(
          { managerId, reportsTo: role.reportsTo },
          'Manager execution unit not found'
        );
        return;
      }

      const response = await this.sendToExecutionUnit(
        manager,
        `Message from ${role.name} (${agentInstance.role}):\n${content}`
      );

      // If manager responded, send that response back to the original agent
      if (response) {
        await this.sendToExecutionUnit(
          agentInstance,
          `Response from ${role.reportsTo}:\n${this.extractResponseText(response)}`
        );
      }
    } catch (error) {
      this.logger.error(
        { error, fromAgentId: agentId, toAgentId: managerId },
        'Failed to route message to manager'
      );

      // Use router's escalation logic as fallback
      router.handleQuestion(agentId, content, undefined, {
        originalMessage: { content },
        routingFailed: true,
      });
    }
  }

  /**
   * Per-unit send queues: turns to the SAME execution unit must be
   * serialized. Two concurrent waiters on one thread would both resolve
   * on its next turn_complete — e.g. parallel engineers each requesting
   * an agent-oracle review from the same singleton architect would cross
   * wires (engineer B receiving engineer A's verdict).
   */
  private unitSendChains: Map<string, Promise<unknown>> = new Map();

  private sendToExecutionUnit(
    unit: OrgAgentInstance,
    message: string,
    input?: unknown
  ): Promise<StepResult> {
    const context = this.unitContexts.get(unit);
    try {
      this.assertActive(context);
    } catch (error) {
      return Promise.reject(error);
    }
    const prev = this.unitSendChains.get(unit.id) ?? Promise.resolve();
    const next = prev
      .catch(() => {}) // a failed predecessor must not poison the queue
      .then(() => {
        this.assertActive(context);
        return abortable(
          this.sendToExecutionUnitNow(unit, message, input),
          context?.signal
        );
      });
    this.unitSendChains.set(unit.id, next);
    return abortable(next, context?.signal);
  }

  private async sendToExecutionUnitNow(
    unit: OrgAgentInstance,
    message: string,
    input?: unknown
  ): Promise<StepResult> {
    // A step's resolved `input` travels inside the message — execution units
    // (CLI threads and agents alike) consume a single text prompt
    const fullMessage =
      input === undefined || input === null || input === ''
        ? message
        : `${message}\n\nInput:\n${
            typeof input === 'string' ? input : JSON.stringify(input, null, 2)
          }`;

    if (unit.kind === 'thread' && unit.threadId) {
      return this.sendToThreadAndWait(
        unit.threadId,
        fullMessage,
        this.unitContexts.get(unit)?.signal
      );
    }

    return this.runtimeService.send(unit.id, fullMessage, {
      expectResponse: true,
      timeout: this.stepTimeout,
    });
  }

  /**
   * Send a message to a thread and wait for completion.
   *
   * Subscribes to thread events and resolves when the thread signals
   * turn_complete or completed. Rejects on failure/stop/timeout.
   */
  private async sendToThreadAndWait(
    threadId: string,
    message: string,
    signal?: AbortSignal
  ): Promise<ThreadCompletionResult> {
    const runtimeService = this.runtimeService;
    signal?.throwIfAborted();
    let rejectCompletion: (error: unknown) => void = () => {};

    // Subscribe to completion events before sending so we don't miss fast responses.
    const completionPromise = new Promise<ThreadCompletionResult>(
      (resolve, reject) => {
        let settled = false;
        let timeoutHandle: NodeJS.Timeout | undefined;
        let unsubscribe: () => void = () => {};
        const abort = () =>
          rejectCompletion(signal?.reason ?? new Error('Workflow cancelled'));

        const cleanup = () => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          unsubscribe();
          signal?.removeEventListener('abort', abort);
        };
        rejectCompletion = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        signal?.addEventListener('abort', abort, { once: true });

        const finalize = async (
          eventData?: Record<string, unknown>
        ): Promise<void> => {
          if (settled) return;
          settled = true;
          cleanup();

          try {
            // Extract output + confidence from event data (sent by
            // ManagedThread with turn_complete)
            let output = '';
            let eventConfidence: number | undefined;
            if (eventData) {
              const dataJson = eventData.data_json;
              if (typeof dataJson === 'string') {
                // Gateway shape: JSON-encoded ThreadEventReport payload
                try {
                  const parsed = JSON.parse(dataJson) as {
                    output?: string;
                    confidence?: number;
                  };
                  output = sanitizeOutput(parsed.output || '', {
                    maxLength: 8000,
                  });
                  if (typeof parsed.confidence === 'number') {
                    eventConfidence = parsed.confidence;
                  }
                } catch {
                  /* ignore parse errors */
                }
              } else {
                // Local runtime shape: plain fields on event data
                if (typeof eventData.output === 'string') {
                  output = sanitizeOutput(eventData.output, {
                    maxLength: 8000,
                  });
                }
                if (typeof eventData.confidence === 'number') {
                  eventConfidence = eventData.confidence;
                }
              }
            }

            const thread = await abortable(
              runtimeService.getThread(threadId),
              signal
            );
            signal?.throwIfAborted();
            const threadMeta = thread?.metadata as
              | Record<string, unknown>
              | undefined;
            const completion = threadMeta?.completion as
              | { summary?: string }
              | undefined;
            const summary =
              output ||
              completion?.summary ||
              (threadMeta?.summary as string) ||
              '';
            resolve({
              threadId,
              result: summary || thread,
              summary,
              confidence: eventConfidence,
            });
          } catch (error) {
            reject(error);
          }
        };

        unsubscribe = runtimeService.subscribeThread(threadId, (event) => {
          const eventType = event.type;
          if (
            eventType === 'thread_turn_complete' ||
            eventType === 'thread_completed'
          ) {
            void finalize(event.data);
            return;
          }

          if (eventType === 'thread_failed' || eventType === 'thread_stopped') {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`Thread ${threadId} ended with ${event.type}`));
          }
        });

        if (this.stepTimeout > 0) {
          timeoutHandle = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(
              new Error(
                `Thread ${threadId} timed out after ${this.stepTimeout}ms`
              )
            );
          }, this.stepTimeout);
        }
      }
    );

    // Attach completion handlers before dispatch so fast failures cannot go unhandled.
    const sending = abortable(
      runtimeService.sendToThread(threadId, { message }),
      signal
    ).catch((error) => {
      rejectCompletion(error);
      throw error;
    });
    const [, completion] = await Promise.all([sending, completionPromise]);
    signal?.throwIfAborted();
    return completion;
  }

  private extractResponseText(response: StepResult): string {
    if (typeof response === 'string') return response;
    if (response == null) return '';
    if (Array.isArray(response)) return JSON.stringify(response);
    if ('summary' in response && response.summary) return response.summary;
    if ('content' in response) return String(response.content);
    return JSON.stringify(response);
  }

  /**
   * Resolve variable references in a value.
   *
   * Supports:
   *   - Whole-string variable: `$varName`
   *   - Inline interpolation: `prefix ${varName} suffix`
   *   - Dotted paths: `${input.task}`, `${input.repo}`
   *   - Recursive resolution of objects and arrays
   */
  private resolveVariables(value: any, context: OrgExecutionContext): any {
    if (typeof value === 'string') {
      // Whole-string variable reference: $varName
      if (value.startsWith('$') && !value.includes('{')) {
        const varName = value.substring(1);
        return this.resolveVarPath(varName, context);
      }

      // Inline ${...} interpolation
      const interpolated = value.replace(
        /\$\{([^}]+)\}/g,
        (_match, expr: string) => {
          const resolved = this.resolveVarPath(expr.trim(), context);
          if (resolved === undefined || resolved === null) return '';
          if (typeof resolved === 'object') return JSON.stringify(resolved);
          return String(resolved);
        }
      );

      // If the entire string was a single ${...} expression, return the raw value
      // (preserving type) instead of stringifying it
      const singleExprMatch = value.match(/^\$\{([^}]+)\}$/);
      if (singleExprMatch) {
        return this.resolveVarPath(singleExprMatch[1].trim(), context);
      }

      return interpolated;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.resolveVariables(v, context));
    }

    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveVariables(v, context);
      }
      return resolved;
    }

    return value;
  }

  /**
   * Resolve a potentially dotted variable path against context variables.
   * E.g. "input.task" → context.variables.get("input").task
   */
  private resolveVarPath(path: string, context: OrgExecutionContext): any {
    const parts = path.split('.');
    let current: any = context.variables.get(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      if (current === undefined || current === null) return undefined;
      current = current[parts[i]];
    }

    return current;
  }

  /**
   * Extract final output from context
   */
  private extractOutput(
    outputSpec: string | undefined,
    context: OrgExecutionContext
  ): StepResult {
    if (!outputSpec) {
      // Return last step result
      const lastStep = context.currentStep || 0;
      return context.variables.get(`step_${lastStep}_result`);
    }

    return this.resolveVariables(`$${outputSpec}`, context);
  }

  /**
   * Cleanup agents after execution
   */
  private async cleanupAgents(context: OrgExecutionContext): Promise<void> {
    const control = this.controls.get(context);
    if (control?.cleanup) return control.cleanup;
    let timer: NodeJS.Timeout | undefined;
    const work = (async () => {
      // A cancelled spawn may resolve late; its continuation stops that unit.
      // Do not acknowledge cleanup until these pending dispatches are reconciled.
      const results = await Promise.allSettled([
        ...(control?.pendingSpawns ?? []),
        ...Array.from(context.agents.values()).map((unit) =>
          unit.kind === 'thread' && unit.threadId
            ? this.runtimeService.stopThread(unit.threadId)
            : this.runtimeService.stop(unit.id)
        ),
      ]);
      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected' &&
          result.reason !== context.signal?.reason
      );
      const errors = [
        ...failures.map((failure) => failure.reason),
        ...(control?.lateCleanupErrors ?? []),
      ];
      if (errors.length)
        throw new AggregateError(
          errors,
          'Failed to stop workflow execution units'
        );
    })();
    const cleanup = Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Workflow runtime cleanup timed out after 10000ms; worker reconciliation required'
              )
            ),
          10000
        );
      }),
    ])
      .catch((error) => {
        this.cleanupFailures.set(context.id, error);
        if (this.cleanupFailures.size > 128)
          this.cleanupFailures.delete(
            this.cleanupFailures.keys().next().value!
          );
        throw error;
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
    if (control) control.cleanup = cleanup;
    return cleanup;
  }
}
