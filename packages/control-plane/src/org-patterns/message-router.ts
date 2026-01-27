/**
 * Org-Chart Message Router
 *
 * Routes messages between agents based on organizational hierarchy and routing rules.
 */

import { Logger } from 'pino';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  OrgStructure,
  OrgAgentInstance,
  OrgExecutionContext,
  AgentQuestion,
  AgentAnswer,
  RoutingRule,
} from './types';

export interface MessageRouterOptions {
  /** Default timeout for question responses (ms) */
  defaultTimeout?: number;

  /** Maximum escalation depth */
  maxEscalationDepth?: number;
}

export class MessageRouter extends EventEmitter {
  private pendingQuestions: Map<string, AgentQuestion> = new Map();
  private questionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private defaultTimeout: number;
  private maxEscalationDepth: number;

  constructor(
    private structure: OrgStructure,
    private context: OrgExecutionContext,
    private logger: Logger,
    private options: MessageRouterOptions = {}
  ) {
    super();
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.maxEscalationDepth = options.maxEscalationDepth || 5;
  }

  /**
   * Route a task to the appropriate agent(s) based on role
   */
  async routeTask(
    fromRole: string,
    toRole: string,
    task: string,
    data?: any
  ): Promise<string[]> {
    const targetAgents = this.getAgentsForRole(toRole);

    if (targetAgents.length === 0) {
      throw new Error(`No agents available for role: ${toRole}`);
    }

    // Check routing rules
    const rule = this.findRoutingRule(fromRole, toRole, 'task');

    if (rule?.broadcast) {
      // Send to all instances
      return targetAgents.map((a) => a.id);
    }

    // Default: send to first available agent
    const available = targetAgents.find((a) => a.status === 'idle');
    if (available) {
      return [available.id];
    }

    // All busy, queue to first one
    return [targetAgents[0].id];
  }

  /**
   * Handle a question from an agent
   */
  async handleQuestion(
    agentId: string,
    question: string,
    topic?: string,
    questionContext?: any
  ): Promise<void> {
    const agent = this.context.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in context`);
    }

    const questionRecord: AgentQuestion = {
      id: uuidv4(),
      agentId,
      role: agent.role,
      question,
      topic,
      context: questionContext,
      askedAt: new Date(),
      escalationPath: [],
    };

    this.pendingQuestions.set(questionRecord.id, questionRecord);

    this.logger.info(
      { questionId: questionRecord.id, agentId, role: agent.role, topic },
      'Routing question'
    );

    // Route the question
    await this.routeQuestion(questionRecord);
  }

  /**
   * Provide an answer to a pending question
   */
  async provideAnswer(
    questionId: string,
    agentId: string,
    answer: string,
    confidence?: number
  ): Promise<void> {
    const question = this.pendingQuestions.get(questionId);
    if (!question) {
      this.logger.warn({ questionId }, 'Answer for unknown question');
      return;
    }

    const agent = this.context.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const answerRecord: AgentAnswer = {
      questionId,
      agentId,
      role: agent.role,
      answer,
      confidence,
      answeredAt: new Date(),
    };

    // Clear timeout
    const timeout = this.questionTimeouts.get(questionId);
    if (timeout) {
      clearTimeout(timeout);
      this.questionTimeouts.delete(questionId);
    }

    // Remove from pending
    this.pendingQuestions.delete(questionId);

    this.logger.info(
      { questionId, answeredBy: agentId, role: agent.role },
      'Question answered'
    );

    // Emit answer event
    this.emit('answer', {
      question,
      answer: answerRecord,
    });

    // Send answer back to original agent
    this.emit('send_answer', {
      toAgentId: question.agentId,
      answer: answerRecord,
    });
  }

  /**
   * Get pending questions for an agent
   */
  getPendingQuestionsFor(agentId: string): AgentQuestion[] {
    return Array.from(this.pendingQuestions.values()).filter(
      (q) => this.isQuestionRoutedTo(q, agentId)
    );
  }

  /**
   * Route a question through the org hierarchy
   */
  private async routeQuestion(question: AgentQuestion): Promise<void> {
    const role = this.structure.roles[question.role];
    if (!role) {
      this.surfaceToUser(question, 'Unknown role');
      return;
    }

    // Check topic-specific routing
    if (question.topic && this.structure.escalation?.topicRoutes) {
      const topicTarget = this.structure.escalation.topicRoutes[question.topic];
      if (topicTarget) {
        await this.routeToRole(question, topicTarget);
        return;
      }
    }

    // Check routing rules
    const rule = this.findRoutingRuleForTopic(question.role, question.topic);
    if (rule) {
      const targetRoles = Array.isArray(rule.to) ? rule.to : [rule.to];
      await this.routeToRole(question, targetRoles[0]);
      return;
    }

    // Default: route to reports_to
    const escalation = this.structure.escalation;
    if (
      escalation?.defaultBehavior === 'route_to_reports_to' &&
      role.reportsTo
    ) {
      await this.routeToRole(question, role.reportsTo);
      return;
    }

    // No route found, surface to user
    this.surfaceToUser(question, 'No route available');
  }

  /**
   * Route question to a specific role
   */
  private async routeToRole(
    question: AgentQuestion,
    targetRole: string
  ): Promise<void> {
    // Check escalation depth
    if (
      question.escalationPath &&
      question.escalationPath.length >= this.maxEscalationDepth
    ) {
      const escalation = this.structure.escalation;
      if (escalation?.onMaxDepth === 'surface_to_user') {
        this.surfaceToUser(question, 'Max escalation depth reached');
      } else if (escalation?.onMaxDepth === 'fail') {
        this.emit('question_failed', {
          question,
          reason: 'Max escalation depth reached',
        });
      }
      return;
    }

    const targetAgents = this.getAgentsForRole(targetRole);
    if (targetAgents.length === 0) {
      // Escalate further
      const role = this.structure.roles[targetRole];
      if (role?.reportsTo) {
        question.escalationPath = [
          ...(question.escalationPath || []),
          targetRole,
        ];
        await this.routeToRole(question, role.reportsTo);
      } else {
        this.surfaceToUser(question, `No agents for role: ${targetRole}`);
      }
      return;
    }

    // Find best agent (prefer idle, then by expertise)
    let targetAgent = targetAgents.find((a) => a.status === 'idle');
    if (!targetAgent) {
      targetAgent = targetAgents[0];
    }

    question.escalationPath = [
      ...(question.escalationPath || []),
      targetRole,
    ];

    this.logger.info(
      {
        questionId: question.id,
        targetAgent: targetAgent.id,
        targetRole,
        escalationPath: question.escalationPath,
      },
      'Question routed'
    );

    // Set timeout for response
    const timeoutMs =
      this.structure.escalation?.timeoutMs || this.defaultTimeout;
    const timeout = setTimeout(() => {
      this.handleQuestionTimeout(question);
    }, timeoutMs);
    this.questionTimeouts.set(question.id, timeout);

    // Emit event to send question to target agent
    this.emit('send_question', {
      toAgentId: targetAgent.id,
      question,
    });
  }

  /**
   * Handle question timeout - escalate or surface
   */
  private handleQuestionTimeout(question: AgentQuestion): void {
    this.questionTimeouts.delete(question.id);

    this.logger.warn(
      { questionId: question.id, escalationPath: question.escalationPath },
      'Question timed out'
    );

    // Try to escalate
    const lastRole =
      question.escalationPath?.[question.escalationPath.length - 1];
    if (lastRole) {
      const role = this.structure.roles[lastRole];
      if (role?.reportsTo) {
        this.routeToRole(question, role.reportsTo);
        return;
      }
    }

    // No more escalation options
    this.surfaceToUser(question, 'Timeout with no escalation path');
  }

  /**
   * Surface question to human user
   */
  private surfaceToUser(question: AgentQuestion, reason: string): void {
    this.pendingQuestions.delete(question.id);

    this.logger.info(
      { questionId: question.id, reason },
      'Surfacing question to user'
    );

    this.emit('surface_to_user', {
      question,
      reason,
    });
  }

  /**
   * Find routing rule for a message
   */
  private findRoutingRule(
    from: string,
    to: string,
    messageType: string
  ): RoutingRule | undefined {
    if (!this.structure.routing) return undefined;

    return this.structure.routing.find((rule) => {
      const fromMatch = Array.isArray(rule.from)
        ? rule.from.includes(from)
        : rule.from === from;
      const toMatch = Array.isArray(rule.to)
        ? rule.to.includes(to)
        : rule.to === to;
      const typeMatch =
        !rule.messageTypes || rule.messageTypes.includes(messageType as any);

      return fromMatch && toMatch && typeMatch;
    });
  }

  /**
   * Find routing rule for a topic
   */
  private findRoutingRuleForTopic(
    from: string,
    topic?: string
  ): RoutingRule | undefined {
    if (!this.structure.routing || !topic) return undefined;

    return this.structure.routing.find((rule) => {
      const fromMatch = Array.isArray(rule.from)
        ? rule.from.includes(from)
        : rule.from === from || rule.from === '*';
      const topicMatch = rule.topics?.includes(topic);

      return fromMatch && topicMatch;
    });
  }

  /**
   * Get agents assigned to a role
   */
  private getAgentsForRole(role: string): OrgAgentInstance[] {
    const agentIds = this.context.roleAssignments.get(role) || [];
    return agentIds
      .map((id) => this.context.agents.get(id))
      .filter((a): a is OrgAgentInstance => a !== undefined);
  }

  /**
   * Check if a question is routed to a specific agent
   */
  private isQuestionRoutedTo(
    question: AgentQuestion,
    agentId: string
  ): boolean {
    const lastRole =
      question.escalationPath?.[question.escalationPath.length - 1];
    if (!lastRole) return false;

    const agentIds = this.context.roleAssignments.get(lastRole) || [];
    return agentIds.includes(agentId);
  }
}
