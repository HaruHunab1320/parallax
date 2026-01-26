/**
 * State Synchronization Service
 *
 * Provides Redis-based state synchronization across multiple control plane
 * instances using pub/sub for real-time updates.
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { Logger } from 'pino';

export interface StateSyncConfig {
  /** Redis connection URL */
  redisUrl: string;
  /** Channel prefix for pub/sub */
  channelPrefix?: string;
  /** Key prefix for state storage */
  keyPrefix?: string;
  /** Instance ID for this node */
  instanceId: string;
}

export interface StateChangeEvent<T = any> {
  type: 'set' | 'delete' | 'expire';
  key: string;
  value?: T;
  sourceInstance: string;
  timestamp: Date;
}

export interface StateSyncEvents {
  'state-change': (event: StateChangeEvent) => void;
  'connected': () => void;
  'disconnected': () => void;
  'error': (error: Error) => void;
}

export declare interface StateSyncService {
  on<E extends keyof StateSyncEvents>(event: E, listener: StateSyncEvents[E]): this;
  emit<E extends keyof StateSyncEvents>(event: E, ...args: Parameters<StateSyncEvents[E]>): boolean;
}

export class StateSyncService extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private logger: Logger;
  private instanceId: string;
  private channelPrefix: string;
  private keyPrefix: string;
  private _isConnected = false;
  private subscriptions: Set<string> = new Set();

  constructor(config: StateSyncConfig, logger: Logger) {
    super();
    this.redis = new Redis(config.redisUrl);
    this.subscriber = new Redis(config.redisUrl);
    this.instanceId = config.instanceId;
    this.channelPrefix = config.channelPrefix || 'parallax:sync:';
    this.keyPrefix = config.keyPrefix || 'parallax:state:';
    this.logger = logger.child({ component: 'StateSync', instanceId: this.instanceId });

    this.setupEventHandlers();
  }

  /**
   * Start the state sync service
   */
  async start(): Promise<void> {
    this.logger.info('Starting state sync service');

    // Subscribe to the main state channel
    await this.subscribe('state');

    this._isConnected = true;
    this.emit('connected');
  }

  /**
   * Stop the state sync service
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping state sync service');
    this._isConnected = false;

    // Unsubscribe from all channels
    for (const channel of this.subscriptions) {
      await this.subscriber.unsubscribe(this.channelPrefix + channel);
    }
    this.subscriptions.clear();

    this.emit('disconnected');
  }

  /**
   * Set a shared state value
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    const serialized = JSON.stringify(value);

    if (ttlMs) {
      await this.redis.set(fullKey, serialized, 'PX', ttlMs);
    } else {
      await this.redis.set(fullKey, serialized);
    }

    // Publish change notification
    await this.publish('state', {
      type: 'set',
      key,
      value,
      sourceInstance: this.instanceId,
      timestamp: new Date(),
    });

    this.logger.debug({ key }, 'State set');
  }

  /**
   * Get a shared state value
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.keyPrefix + key;
    const value = await this.redis.get(fullKey);

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Delete a shared state value
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.keyPrefix + key;
    const deleted = await this.redis.del(fullKey);

    if (deleted > 0) {
      // Publish change notification
      await this.publish('state', {
        type: 'delete',
        key,
        sourceInstance: this.instanceId,
        timestamp: new Date(),
      });

      this.logger.debug({ key }, 'State deleted');
      return true;
    }

    return false;
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.keyPrefix + key;
    const exists = await this.redis.exists(fullKey);
    return exists === 1;
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    const fullPattern = this.keyPrefix + pattern;
    const keys = await this.redis.keys(fullPattern);
    return keys.map((k) => k.slice(this.keyPrefix.length));
  }

  /**
   * Get multiple values
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    if (keys.length === 0) {
      return new Map();
    }

    const fullKeys = keys.map((k) => this.keyPrefix + k);
    const values = await this.redis.mget(...fullKeys);

    const result = new Map<string, T>();
    keys.forEach((key, index) => {
      const value = values[index];
      if (value !== null) {
        try {
          result.set(key, JSON.parse(value) as T);
        } catch {
          result.set(key, value as unknown as T);
        }
      }
    });

    return result;
  }

  /**
   * Set multiple values atomically
   */
  async setMany<T>(entries: Map<string, T>): Promise<void> {
    if (entries.size === 0) {
      return;
    }

    const pipeline = this.redis.pipeline();
    const updates: StateChangeEvent[] = [];

    entries.forEach((value, key) => {
      const fullKey = this.keyPrefix + key;
      pipeline.set(fullKey, JSON.stringify(value));
      updates.push({
        type: 'set',
        key,
        value,
        sourceInstance: this.instanceId,
        timestamp: new Date(),
      });
    });

    await pipeline.exec();

    // Publish all changes
    for (const update of updates) {
      await this.publish('state', update);
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string): Promise<void> {
    const fullChannel = this.channelPrefix + channel;
    await this.subscriber.subscribe(fullChannel);
    this.subscriptions.add(channel);
    this.logger.debug({ channel }, 'Subscribed to channel');
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string): Promise<void> {
    const fullChannel = this.channelPrefix + channel;
    await this.subscriber.unsubscribe(fullChannel);
    this.subscriptions.delete(channel);
    this.logger.debug({ channel }, 'Unsubscribed from channel');
  }

  /**
   * Publish a message to a channel
   */
  async publish<T>(channel: string, message: T): Promise<number> {
    const fullChannel = this.channelPrefix + channel;
    const serialized = JSON.stringify(message);
    return this.redis.publish(fullChannel, serialized);
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.stop();
    this.redis.disconnect();
    this.subscriber.disconnect();
  }

  private setupEventHandlers(): void {
    // Handle incoming messages
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as StateChangeEvent;

        // Don't emit our own changes back to ourselves
        if (event.sourceInstance === this.instanceId) {
          return;
        }

        this.emit('state-change', event);
        this.logger.debug({ event }, 'Received state change');
      } catch (error) {
        this.logger.error({ error, message }, 'Failed to parse state change message');
      }
    });

    // Handle connection errors
    this.redis.on('error', (error) => {
      this.logger.error({ error }, 'Redis error');
      this.emit('error', error);
    });

    this.subscriber.on('error', (error) => {
      this.logger.error({ error }, 'Redis subscriber error');
      this.emit('error', error);
    });

    // Handle reconnection
    this.redis.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }
}

/**
 * State namespaces for organizing shared state
 */
export const StateNamespaces = {
  /** Execution state */
  execution: (executionId: string) => `execution:${executionId}`,
  /** Agent state */
  agent: (agentId: string) => `agent:${agentId}`,
  /** Pattern state */
  pattern: (patternId: string) => `pattern:${patternId}`,
  /** Cluster node state */
  node: (nodeId: string) => `node:${nodeId}`,
  /** Schedule state */
  schedule: (scheduleId: string) => `schedule:${scheduleId}`,
} as const;

/**
 * Create a state sync service
 */
export function createStateSync(
  redisUrl: string,
  instanceId: string,
  logger: Logger,
  options?: Partial<StateSyncConfig>
): StateSyncService {
  return new StateSyncService(
    {
      redisUrl,
      instanceId,
      ...options,
    },
    logger
  );
}
