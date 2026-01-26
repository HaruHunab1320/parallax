/**
 * Trigger Service
 *
 * Manages webhook and event-based triggers for pattern execution.
 */

import { PrismaClient, Trigger } from '@prisma/client';
import { Logger } from 'pino';
import { EventEmitter } from 'events';
import { createHmac, randomBytes } from 'crypto';
import { IPatternEngine } from '../pattern-engine/interfaces';

export interface WebhookTriggerConfig {
  name: string;
  patternName: string;
  description?: string;
  secret?: string; // Optional secret for HMAC validation
  inputMapping?: Record<string, string>; // JSON path mapping from webhook payload to pattern input
  metadata?: Record<string, any>;
}

export interface EventTriggerConfig {
  name: string;
  patternName: string;
  description?: string;
  eventType: string; // Event type to listen for
  eventFilter?: Record<string, any>; // Filter conditions
  inputMapping?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface WebhookPayload {
  headers: Record<string, string>;
  body: any;
  query?: Record<string, string>;
}

export interface TriggerResult {
  triggered: boolean;
  executionId?: string;
  error?: string;
}

export interface TriggerServiceEvents {
  'trigger-created': (trigger: Trigger) => void;
  'trigger-updated': (trigger: Trigger) => void;
  'trigger-deleted': (triggerId: string) => void;
  'trigger-fired': (trigger: Trigger, executionId: string) => void;
  'trigger-failed': (trigger: Trigger, error: Error) => void;
  'event': (eventType: string, payload: any) => void;
  'error': (error: Error) => void;
}

export declare interface TriggerService {
  on<E extends keyof TriggerServiceEvents>(event: E, listener: TriggerServiceEvents[E]): this;
  emit<E extends keyof TriggerServiceEvents>(event: E, ...args: Parameters<TriggerServiceEvents[E]>): boolean;
}

export class TriggerService extends EventEmitter {
  private prisma: PrismaClient;
  private patternEngine: IPatternEngine;
  private logger: Logger;
  private eventTriggers: Map<string, Trigger[]> = new Map();

  constructor(
    prisma: PrismaClient,
    patternEngine: IPatternEngine,
    logger: Logger
  ) {
    super();
    this.prisma = prisma;
    this.patternEngine = patternEngine;
    this.logger = logger.child({ component: 'TriggerService' });
  }

  /**
   * Initialize the trigger service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing trigger service');

    // Load all event triggers into memory
    const eventTriggers = await this.prisma.trigger.findMany({
      where: {
        type: 'event',
        status: 'active',
      },
    });

    for (const trigger of eventTriggers) {
      this.registerEventTrigger(trigger);
    }

    this.logger.info({ count: eventTriggers.length }, 'Event triggers loaded');
  }

  /**
   * Create a webhook trigger
   */
  async createWebhookTrigger(config: WebhookTriggerConfig): Promise<Trigger> {
    // Generate unique webhook path
    const webhookPath = this.generateWebhookPath();

    const trigger = await this.prisma.trigger.create({
      data: {
        name: config.name,
        type: 'webhook',
        patternName: config.patternName,
        description: config.description,
        webhookPath,
        webhookSecret: config.secret || this.generateSecret(),
        inputMapping: config.inputMapping,
        metadata: config.metadata,
        status: 'active',
      },
    });

    this.logger.info(
      { triggerId: trigger.id, webhookPath },
      'Webhook trigger created'
    );
    this.emit('trigger-created', trigger);

    return trigger;
  }

  /**
   * Create an event trigger
   */
  async createEventTrigger(config: EventTriggerConfig): Promise<Trigger> {
    const trigger = await this.prisma.trigger.create({
      data: {
        name: config.name,
        type: 'event',
        patternName: config.patternName,
        description: config.description,
        eventType: config.eventType,
        eventFilter: config.eventFilter,
        inputMapping: config.inputMapping,
        metadata: config.metadata,
        status: 'active',
      },
    });

    this.registerEventTrigger(trigger);

    this.logger.info(
      { triggerId: trigger.id, eventType: config.eventType },
      'Event trigger created'
    );
    this.emit('trigger-created', trigger);

    return trigger;
  }

  /**
   * Update a trigger
   */
  async updateTrigger(
    triggerId: string,
    updates: Partial<WebhookTriggerConfig & EventTriggerConfig>
  ): Promise<Trigger> {
    const existing = await this.prisma.trigger.findUnique({
      where: { id: triggerId },
    });

    if (!existing) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }

    const data: any = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.patternName !== undefined) data.patternName = updates.patternName;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.secret !== undefined) data.webhookSecret = updates.secret;
    if (updates.eventType !== undefined) data.eventType = updates.eventType;
    if (updates.eventFilter !== undefined) data.eventFilter = updates.eventFilter;
    if (updates.inputMapping !== undefined) data.inputMapping = updates.inputMapping;
    if (updates.metadata !== undefined) data.metadata = updates.metadata;

    const trigger = await this.prisma.trigger.update({
      where: { id: triggerId },
      data,
    });

    // Update event trigger registration
    if (existing.type === 'event') {
      this.unregisterEventTrigger(existing);
      if (trigger.status === 'active') {
        this.registerEventTrigger(trigger);
      }
    }

    this.logger.info({ triggerId }, 'Trigger updated');
    this.emit('trigger-updated', trigger);

    return trigger;
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(triggerId: string): Promise<void> {
    const trigger = await this.prisma.trigger.findUnique({
      where: { id: triggerId },
    });

    if (trigger?.type === 'event') {
      this.unregisterEventTrigger(trigger);
    }

    await this.prisma.trigger.delete({
      where: { id: triggerId },
    });

    this.logger.info({ triggerId }, 'Trigger deleted');
    this.emit('trigger-deleted', triggerId);
  }

  /**
   * Get a trigger by ID
   */
  async getTrigger(triggerId: string): Promise<Trigger | null> {
    return this.prisma.trigger.findUnique({
      where: { id: triggerId },
    });
  }

  /**
   * Get a trigger by webhook path
   */
  async getTriggerByWebhookPath(path: string): Promise<Trigger | null> {
    return this.prisma.trigger.findUnique({
      where: { webhookPath: path },
    });
  }

  /**
   * List all triggers
   */
  async listTriggers(options?: {
    type?: 'webhook' | 'event';
    status?: string;
    patternName?: string;
    limit?: number;
    offset?: number;
  }): Promise<Trigger[]> {
    const where: any = {};

    if (options?.type) where.type = options.type;
    if (options?.status) where.status = options.status;
    if (options?.patternName) where.patternName = options.patternName;

    return this.prisma.trigger.findMany({
      where,
      take: options?.limit,
      skip: options?.offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Pause a trigger
   */
  async pauseTrigger(triggerId: string): Promise<Trigger> {
    const existing = await this.prisma.trigger.findUnique({
      where: { id: triggerId },
    });

    if (existing?.type === 'event') {
      this.unregisterEventTrigger(existing);
    }

    const trigger = await this.prisma.trigger.update({
      where: { id: triggerId },
      data: { status: 'paused' },
    });

    this.logger.info({ triggerId }, 'Trigger paused');
    this.emit('trigger-updated', trigger);

    return trigger;
  }

  /**
   * Resume a trigger
   */
  async resumeTrigger(triggerId: string): Promise<Trigger> {
    const trigger = await this.prisma.trigger.update({
      where: { id: triggerId },
      data: { status: 'active' },
    });

    if (trigger.type === 'event') {
      this.registerEventTrigger(trigger);
    }

    this.logger.info({ triggerId }, 'Trigger resumed');
    this.emit('trigger-updated', trigger);

    return trigger;
  }

  /**
   * Handle an incoming webhook
   */
  async handleWebhook(
    path: string,
    payload: WebhookPayload
  ): Promise<TriggerResult> {
    const trigger = await this.getTriggerByWebhookPath(path);

    if (!trigger) {
      return { triggered: false, error: 'Trigger not found' };
    }

    if (trigger.status !== 'active') {
      return { triggered: false, error: 'Trigger is not active' };
    }

    // Validate signature if secret is set
    if (trigger.webhookSecret) {
      const signature = payload.headers['x-parallax-signature'] ||
                        payload.headers['x-hub-signature-256'];

      if (!signature || !this.validateSignature(payload.body, trigger.webhookSecret, signature)) {
        this.logger.warn({ triggerId: trigger.id }, 'Webhook signature validation failed');
        return { triggered: false, error: 'Invalid signature' };
      }
    }

    try {
      const input = this.mapInput(payload.body, trigger.inputMapping as Record<string, string> | null);

      this.logger.info(
        { triggerId: trigger.id, patternName: trigger.patternName },
        'Executing webhook trigger'
      );

      const result = await this.patternEngine.executePattern(trigger.patternName, input);

      // Update trigger stats
      await this.prisma.trigger.update({
        where: { id: trigger.id },
        data: {
          lastTriggered: new Date(),
          triggerCount: { increment: 1 },
        },
      });

      this.emit('trigger-fired', trigger, result.id);

      return { triggered: true, executionId: result.id };
    } catch (error) {
      this.logger.error({ error, triggerId: trigger.id }, 'Webhook trigger failed');
      this.emit('trigger-failed', trigger, error as Error);
      return { triggered: false, error: (error as Error).message };
    }
  }

  /**
   * Emit an event (internal event bus)
   */
  async emitEvent(eventType: string, payload: any): Promise<void> {
    this.logger.debug({ eventType }, 'Event emitted');
    this.emit('event', eventType, payload);

    const triggers = this.eventTriggers.get(eventType) || [];

    for (const trigger of triggers) {
      if (trigger.status !== 'active') {
        continue;
      }

      // Check filter conditions
      if (!this.matchesFilter(payload, trigger.eventFilter as Record<string, any> | null)) {
        continue;
      }

      try {
        const input = this.mapInput(payload, trigger.inputMapping as Record<string, string> | null);

        this.logger.info(
          { triggerId: trigger.id, eventType, patternName: trigger.patternName },
          'Executing event trigger'
        );

        const result = await this.patternEngine.executePattern(trigger.patternName, input);

        // Update trigger stats
        await this.prisma.trigger.update({
          where: { id: trigger.id },
          data: {
            lastTriggered: new Date(),
            triggerCount: { increment: 1 },
          },
        });

        this.emit('trigger-fired', trigger, result.id);
      } catch (error) {
        this.logger.error({ error, triggerId: trigger.id, eventType }, 'Event trigger failed');
        this.emit('trigger-failed', trigger, error as Error);
      }
    }
  }

  /**
   * Get webhook URL for a trigger
   */
  getWebhookUrl(trigger: Trigger, baseUrl: string): string {
    if (trigger.type !== 'webhook' || !trigger.webhookPath) {
      throw new Error('Not a webhook trigger');
    }
    return `${baseUrl}/api/webhooks/${trigger.webhookPath}`;
  }

  private registerEventTrigger(trigger: Trigger): void {
    if (!trigger.eventType) return;

    const triggers = this.eventTriggers.get(trigger.eventType) || [];
    triggers.push(trigger);
    this.eventTriggers.set(trigger.eventType, triggers);
  }

  private unregisterEventTrigger(trigger: Trigger): void {
    if (!trigger.eventType) return;

    const triggers = this.eventTriggers.get(trigger.eventType) || [];
    const index = triggers.findIndex((t) => t.id === trigger.id);
    if (index !== -1) {
      triggers.splice(index, 1);
      this.eventTriggers.set(trigger.eventType, triggers);
    }
  }

  private generateWebhookPath(): string {
    return randomBytes(16).toString('hex');
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private validateSignature(payload: any, secret: string, signature: string): boolean {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = 'sha256=' + createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return signature === expectedSignature;
  }

  private mapInput(
    payload: any,
    mapping: Record<string, string> | null
  ): Record<string, any> {
    if (!mapping) {
      return payload;
    }

    const input: Record<string, any> = {};

    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      input[targetKey] = this.getValueByPath(payload, sourcePath);
    }

    return input;
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private matchesFilter(
    payload: any,
    filter: Record<string, any> | null
  ): boolean {
    if (!filter) {
      return true;
    }

    for (const [key, expectedValue] of Object.entries(filter)) {
      const actualValue = this.getValueByPath(payload, key);

      if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Handle operators like { $eq, $ne, $gt, $lt, $in, etc. }
        for (const [op, opValue] of Object.entries(expectedValue)) {
          switch (op) {
            case '$eq':
              if (actualValue !== opValue) return false;
              break;
            case '$ne':
              if (actualValue === opValue) return false;
              break;
            case '$gt':
              if (!(actualValue > (opValue as number))) return false;
              break;
            case '$gte':
              if (!(actualValue >= (opValue as number))) return false;
              break;
            case '$lt':
              if (!(actualValue < (opValue as number))) return false;
              break;
            case '$lte':
              if (!(actualValue <= (opValue as number))) return false;
              break;
            case '$in':
              if (!Array.isArray(opValue) || !opValue.includes(actualValue)) return false;
              break;
            case '$nin':
              if (Array.isArray(opValue) && opValue.includes(actualValue)) return false;
              break;
            case '$exists':
              if ((actualValue !== undefined) !== opValue) return false;
              break;
            default:
              // Treat as nested object comparison
              if (!this.matchesFilter(actualValue, { [op]: opValue })) return false;
          }
        }
      } else {
        // Direct equality check
        if (actualValue !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }
}

/**
 * Built-in event types
 */
export const EventTypes = {
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',
  AGENT_CONNECTED: 'agent.connected',
  AGENT_DISCONNECTED: 'agent.disconnected',
  PATTERN_CREATED: 'pattern.created',
  PATTERN_UPDATED: 'pattern.updated',
  SCHEDULE_EXECUTED: 'schedule.executed',
  SCHEDULE_FAILED: 'schedule.failed',
} as const;

/**
 * Create a trigger service
 */
export function createTriggerService(
  prisma: PrismaClient,
  patternEngine: IPatternEngine,
  logger: Logger
): TriggerService {
  return new TriggerService(prisma, patternEngine, logger);
}
