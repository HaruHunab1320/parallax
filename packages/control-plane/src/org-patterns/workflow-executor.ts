/**
 * Org-Chart Workflow Executor
 *
 * Executes workflows defined in org-chart patterns.
 */

import { Logger } from 'pino';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  OrgPattern,
  OrgExecutionContext,
  OrgAgentInstance,
  WorkflowStep,
  OrgRole,
} from './types';
import { MessageRouter } from './message-router';
import { AgentRuntimeService } from '../agent-runtime';
import { AgentConfig, AgentHandle } from '@parallax/runtime-interface';

export interface WorkflowExecutorOptions {
  /** Timeout for individual steps (ms) */
  stepTimeout?: number;

  /** Maximum parallel operations */
  maxParallel?: number;
}

export interface WorkflowResult {
  /** Execution ID */
  executionId: string;

  /** Pattern name */
  patternName: string;

  /** Final output */
  output: any;

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
    result: any;
    durationMs: number;
  }>;
}

export class WorkflowExecutor extends EventEmitter {
  private stepTimeout: number;
  private maxParallel: number;

  constructor(
    private runtimeService: AgentRuntimeService,
    private logger: Logger,
    private options: WorkflowExecutorOptions = {}
  ) {
    super();
    this.stepTimeout = options.stepTimeout || 60000;
    this.maxParallel = options.maxParallel || 10;
  }

  /**
   * Execute an org-chart pattern workflow
   */
  async execute(pattern: OrgPattern, input: any): Promise<WorkflowResult> {
    const executionId = uuidv4();
    const startedAt = new Date();

    this.logger.info(
      { executionId, pattern: pattern.name },
      'Starting org workflow execution'
    );

    // Create execution context
    const context: OrgExecutionContext = {
      id: executionId,
      pattern,
      agents: new Map(),
      roleAssignments: new Map(),
      state: 'initializing',
      variables: new Map([['input', input]]),
      startedAt,
    };

    const stepResults: WorkflowResult['steps'] = [];
    let unsubscribeMessages: (() => void) | null = null;

    try {
      // Initialize agents for all roles
      await this.initializeAgents(pattern.structure.roles, context);

      // Create message router
      const router = new MessageRouter(
        pattern.structure,
        context,
        this.logger
      );

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

        stepResults.push({
          step: i,
          type: step.type,
          result,
          durationMs: Date.now() - stepStart,
        });

        // Store result in variables if it's an assign step
        if (step.type === 'assign') {
          context.variables.set(`step_${i}_result`, result);
        }
      }

      context.state = 'completed';

      // Cleanup message subscriptions
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }

      // Cleanup agents
      await this.cleanupAgents(context);

      const completedAt = new Date();
      const finalOutput = this.extractOutput(pattern.workflow.output, context);

      this.logger.info(
        { executionId, durationMs: completedAt.getTime() - startedAt.getTime() },
        'Org workflow completed'
      );

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
      context.state = 'failed';

      this.logger.error(
        { executionId, error },
        'Org workflow failed'
      );

      // Cleanup message subscriptions
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }

      // Cleanup agents
      await this.cleanupAgents(context);

      throw error;
    }
  }

  /**
   * Initialize agents for all roles
   */
  private async initializeAgents(
    roles: Record<string, OrgRole>,
    context: OrgExecutionContext
  ): Promise<void> {
    const spawnPromises: Promise<void>[] = [];

    for (const [roleId, role] of Object.entries(roles)) {
      const count = role.singleton ? 1 : role.minInstances || 1;

      for (let i = 0; i < count; i++) {
        spawnPromises.push(
          this.spawnAgentForRole(roleId, role, context, i)
        );
      }
    }

    await Promise.all(spawnPromises);
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
    const agentType = Array.isArray(role.agentType)
      ? role.agentType[0]
      : role.agentType;

    const config: AgentConfig = {
      name: `${role.name} ${index + 1}`,
      type: agentType,
      capabilities: role.capabilities,
      role: roleId,
      ...role.agentConfig,
    };

    const handle = await this.runtimeService.spawn(config);

    const instance: OrgAgentInstance = {
      id: handle.id,
      role: roleId,
      endpoint: handle.endpoint || '',
      status: 'idle',
    };

    context.agents.set(handle.id, instance);

    // Update role assignments
    const assignments = context.roleAssignments.get(roleId) || [];
    assignments.push(handle.id);
    context.roleAssignments.set(roleId, assignments);

    this.logger.debug(
      { agentId: handle.id, role: roleId },
      'Agent spawned for role'
    );
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<any> {
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
  ): Promise<any> {
    const agentIds = context.roleAssignments.get(step.role);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for role: ${step.role}`);
    }

    // Get first available agent
    const agentId = agentIds[0];
    const agent = context.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'busy';
    agent.currentTask = step.task;

    // Resolve input variables
    const input = this.resolveVariables(step.input, context);

    // Send task to agent
    const response = await this.runtimeService.send(agentId, step.task, {
      expectResponse: true,
      timeout: this.stepTimeout,
    });

    agent.status = 'idle';
    agent.currentTask = undefined;

    return response;
  }

  /**
   * Execute parallel steps
   */
  private async executeParallelStep(
    step: Extract<WorkflowStep, { type: 'parallel' }>,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<any[]> {
    const results = await Promise.all(
      step.steps.map((s) => this.executeStep(s, context, router))
    );
    return results;
  }

  /**
   * Execute sequential steps
   */
  private async executeSequentialStep(
    step: Extract<WorkflowStep, { type: 'sequential' }>,
    context: OrgExecutionContext,
    router: MessageRouter
  ): Promise<any[]> {
    const results: any[] = [];
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
  ): Promise<any> {
    const agentIds = context.roleAssignments.get(step.reviewer);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for reviewer role: ${step.reviewer}`);
    }

    const reviewerId = agentIds[0];
    const subject = this.resolveVariables(step.subject, context);

    const response = await this.runtimeService.send(
      reviewerId,
      `Please review the following:\n\n${JSON.stringify(subject, null, 2)}`,
      { expectResponse: true, timeout: this.stepTimeout }
    );

    return response;
  }

  /**
   * Execute an approval step
   */
  private async executeApproveStep(
    step: Extract<WorkflowStep, { type: 'approve' }>,
    context: OrgExecutionContext
  ): Promise<any> {
    const agentIds = context.roleAssignments.get(step.approver);
    if (!agentIds || agentIds.length === 0) {
      throw new Error(`No agents for approver role: ${step.approver}`);
    }

    const approverId = agentIds[0];
    const subject = this.resolveVariables(step.subject, context);

    const response = await this.runtimeService.send(
      approverId,
      `Please approve or reject the following:\n\n${JSON.stringify(subject, null, 2)}`,
      { expectResponse: true, timeout: this.stepTimeout }
    );

    return response;
  }

  /**
   * Execute an aggregation step
   */
  private async executeAggregateStep(
    step: Extract<WorkflowStep, { type: 'aggregate' }>,
    context: OrgExecutionContext
  ): Promise<any> {
    // Get results from previous parallel step
    const lastStepIndex = (context.currentStep || 1) - 1;
    const previousResults = context.variables.get(`step_${lastStepIndex}_result`);

    if (!Array.isArray(previousResults)) {
      return previousResults;
    }

    switch (step.method) {
      case 'consensus':
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

      case 'majority':
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
  ): Promise<any> {
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
      try {
        await this.runtimeService.send(
          toAgentId,
          `Question: ${question.question}\nContext: ${JSON.stringify(question.context)}`,
          { expectResponse: false }
        );
      } catch (error) {
        this.logger.error({ error, toAgentId }, 'Failed to send question');
      }
    });

    router.on('send_answer', async ({ toAgentId, answer }) => {
      try {
        await this.runtimeService.send(
          toAgentId,
          `Answer to your question: ${answer.answer}`,
          { expectResponse: false }
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
      const unsubscribe = this.runtimeService.subscribe(agentId, async (message) => {
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
            message,
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
          { fromAgentId: agentId, toAgentId: managerId, fromRole: agentInstance.role, toRole: role.reportsTo },
          'Routing agent message to manager'
        );

        try {
          // Send the message to the manager agent
          // The manager (as an LLM) will naturally understand and respond
          const response = await this.runtimeService.send(
            managerId,
            `Message from ${role.name} (${agentInstance.role}):\n${message.content}`,
            { expectResponse: true, timeout: 30000 }
          );

          // If manager responded, send that response back to the original agent
          if (response) {
            await this.runtimeService.send(
              agentId,
              `Response from ${role.reportsTo}:\n${response.content}`,
              { expectResponse: false }
            );
          }
        } catch (error) {
          this.logger.error(
            { error, fromAgentId: agentId, toAgentId: managerId },
            'Failed to route message to manager'
          );

          // Use router's escalation logic as fallback
          router.handleQuestion(agentId, message.content, undefined, {
            originalMessage: message,
            routingFailed: true,
          });
        }
      });

      unsubscribers.push(unsubscribe);
    }

    // Return function to unsubscribe all
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Resolve variable references in a value
   */
  private resolveVariables(value: any, context: OrgExecutionContext): any {
    if (typeof value === 'string' && value.startsWith('$')) {
      const varName = value.substring(1);
      return context.variables.get(varName);
    }
    return value;
  }

  /**
   * Extract final output from context
   */
  private extractOutput(
    outputSpec: string | undefined,
    context: OrgExecutionContext
  ): any {
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
    const stopPromises = Array.from(context.agents.keys()).map((agentId) =>
      this.runtimeService.stop(agentId).catch((error) => {
        this.logger.warn({ error, agentId }, 'Failed to stop agent during cleanup');
      })
    );

    await Promise.allSettled(stopPromises);
  }
}
