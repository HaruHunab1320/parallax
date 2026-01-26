/**
 * Leader Election Service
 *
 * Uses etcd lease-based election to elect a single leader among multiple
 * control plane instances. Only the leader executes scheduled patterns,
 * cleanup tasks, and other singleton operations.
 */

import { Etcd3, Election, Campaign } from 'etcd3';
import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

export interface LeaderElectionConfig {
  /** etcd endpoints */
  endpoints: string[];
  /** Election namespace/prefix in etcd */
  electionName?: string;
  /** TTL for the leader lease in seconds */
  leaseTTL?: number;
  /** Instance ID (auto-generated if not provided) */
  instanceId?: string;
  /** Metadata about this instance */
  metadata?: Record<string, any>;
}

export interface LeaderInfo {
  instanceId: string;
  electedAt: Date;
  metadata?: Record<string, any>;
}

export interface LeaderElectionEvents {
  'elected': (info: LeaderInfo) => void;
  'demoted': () => void;
  'leader-changed': (leaderId: string | null) => void;
  'error': (error: Error) => void;
}

export declare interface LeaderElectionService {
  on<E extends keyof LeaderElectionEvents>(event: E, listener: LeaderElectionEvents[E]): this;
  emit<E extends keyof LeaderElectionEvents>(event: E, ...args: Parameters<LeaderElectionEvents[E]>): boolean;
}

export class LeaderElectionService extends EventEmitter {
  private client: Etcd3;
  private election: Election;
  private campaign: Campaign | null = null;
  private logger: Logger;
  private instanceId: string;
  private metadata: Record<string, any>;
  private electionName: string;
  private _leaseTTL: number;
  private isRunning = false;
  private _isLeader = false;
  private currentLeaderId: string | null = null;
  private leaderWatcher: any = null;

  constructor(config: LeaderElectionConfig, logger: Logger) {
    super();
    this.client = new Etcd3({ hosts: config.endpoints });
    this.electionName = config.electionName || '/parallax/leader';
    this._leaseTTL = config.leaseTTL || 10; // 10 second lease
    this.instanceId = config.instanceId || `cp-${uuidv4().slice(0, 8)}`;
    this.metadata = config.metadata || {};
    this.logger = logger.child({ component: 'LeaderElection', instanceId: this.instanceId });

    this.election = this.client.election(this.electionName);
  }

  /**
   * Start participating in leader election
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Leader election already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting leader election');

    try {
      // Watch for leader changes
      await this.watchLeader();

      // Start campaigning for leadership
      await this.campaignForLeadership();
    } catch (error) {
      this.isRunning = false;
      this.logger.error({ error }, 'Failed to start leader election');
      throw error;
    }
  }

  /**
   * Stop participating in leader election
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping leader election');
    this.isRunning = false;

    // Stop watching
    if (this.leaderWatcher) {
      this.leaderWatcher.cancel();
      this.leaderWatcher = null;
    }

    // Resign if we're the leader
    if (this._isLeader && this.campaign) {
      try {
        await this.campaign.resign();
        this._isLeader = false;
        this.emit('demoted');
        this.logger.info('Resigned from leadership');
      } catch (error) {
        this.logger.error({ error }, 'Error resigning from leadership');
      }
    }

    this.campaign = null;
  }

  /**
   * Check if this instance is the leader
   */
  isLeader(): boolean {
    return this._isLeader;
  }

  /**
   * Get the current leader ID
   */
  getLeaderId(): string | null {
    return this.currentLeaderId;
  }

  /**
   * Get this instance's ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Get leader info if this instance is leader
   */
  getLeaderInfo(): LeaderInfo | null {
    if (!this._isLeader) {
      return null;
    }
    return {
      instanceId: this.instanceId,
      electedAt: new Date(),
      metadata: this.metadata,
    };
  }

  /**
   * Gracefully close the etcd connection
   */
  async close(): Promise<void> {
    await this.stop();
    this.client.close();
  }

  private async campaignForLeadership(): Promise<void> {
    const leaderValue = JSON.stringify({
      instanceId: this.instanceId,
      electedAt: new Date().toISOString(),
      metadata: this.metadata,
    });

    try {
      this.campaign = this.election.campaign(leaderValue);

      this.campaign.on('elected', () => {
        this._isLeader = true;
        this.currentLeaderId = this.instanceId;
        const info: LeaderInfo = {
          instanceId: this.instanceId,
          electedAt: new Date(),
          metadata: this.metadata,
        };
        this.logger.info('This instance elected as leader');
        this.emit('elected', info);
        this.emit('leader-changed', this.instanceId);
      });

      this.campaign.on('error', (error: Error) => {
        this.logger.error({ error }, 'Campaign error');
        this.emit('error', error);

        // If we were the leader, we've been demoted
        if (this._isLeader) {
          this._isLeader = false;
          this.emit('demoted');
        }
      });

      this.logger.info('Campaigning for leadership');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start campaign');
      throw error;
    }
  }

  private async watchLeader(): Promise<void> {
    try {
      // Get initial leader
      const leader = await this.election.leader();
      if (leader) {
        try {
          const leaderData = JSON.parse(leader);
          this.currentLeaderId = leaderData.instanceId;
          this.logger.info({ leaderId: this.currentLeaderId }, 'Current leader detected');
        } catch {
          this.currentLeaderId = leader;
        }
      }

      // Watch for leader changes
      this.leaderWatcher = await this.election.observe();

      this.leaderWatcher.on('change', (value: string) => {
        try {
          const leaderData = JSON.parse(value);
          const newLeaderId = leaderData.instanceId;

          if (newLeaderId !== this.currentLeaderId) {
            this.currentLeaderId = newLeaderId;
            this.logger.info({ leaderId: newLeaderId }, 'Leader changed');
            this.emit('leader-changed', newLeaderId);

            // Check if we lost leadership
            if (this._isLeader && newLeaderId !== this.instanceId) {
              this._isLeader = false;
              this.emit('demoted');
            }
          }
        } catch (error) {
          this.logger.warn({ error, value }, 'Failed to parse leader value');
        }
      });

      this.leaderWatcher.on('end', () => {
        this.logger.warn('Leader watcher ended');
        // Restart watcher if we're still running
        if (this.isRunning) {
          setTimeout(() => this.watchLeader(), 1000);
        }
      });

    } catch (error) {
      this.logger.error({ error }, 'Failed to watch leader');
      throw error;
    }
  }

  /**
   * Execute a function only if this instance is the leader.
   * Returns undefined if not the leader.
   */
  async asLeader<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!this._isLeader) {
      return undefined;
    }
    return fn();
  }

  /**
   * Wait until this instance becomes the leader.
   * Resolves immediately if already leader.
   * Rejects if timeout is reached.
   */
  async waitForLeadership(timeoutMs: number = 30000): Promise<void> {
    if (this._isLeader) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('elected', onElected);
        reject(new Error('Timeout waiting for leadership'));
      }, timeoutMs);

      const onElected = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.once('elected', onElected);
    });
  }
}

/**
 * Create a leader election service with default config
 */
export function createLeaderElection(
  endpoints: string[],
  logger: Logger,
  options?: Partial<LeaderElectionConfig>
): LeaderElectionService {
  return new LeaderElectionService(
    {
      endpoints,
      ...options,
    },
    logger
  );
}
