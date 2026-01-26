/**
 * Cluster Health Service
 *
 * Monitors and reports the health of all control plane nodes in the cluster.
 */

import { Logger } from 'pino';
import { LeaderElectionService } from './leader-election';
import { StateSyncService, StateNamespaces } from './state-sync';

export interface NodeInfo {
  instanceId: string;
  hostname: string;
  port: number;
  startedAt: Date;
  lastHeartbeat: Date;
  isLeader: boolean;
  status: 'healthy' | 'unhealthy' | 'unknown';
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    activeExecutions?: number;
  };
}

export interface ClusterHealth {
  healthy: boolean;
  nodeCount: number;
  healthyNodeCount: number;
  leaderId: string | null;
  thisNode: string;
  isLeader: boolean;
  nodes: NodeInfo[];
  lastUpdated: Date;
}

export interface ClusterHealthConfig {
  /** Instance ID for this node */
  instanceId: string;
  /** Hostname for this node */
  hostname: string;
  /** Port for this node */
  port: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Node timeout in milliseconds (considered unhealthy after this) */
  nodeTimeout?: number;
}

export class ClusterHealthService {
  private leaderElection: LeaderElectionService;
  private stateSync: StateSyncService;
  private logger: Logger;
  private config: Required<ClusterHealthConfig>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private startedAt: Date;
  private isRunning = false;

  constructor(
    leaderElection: LeaderElectionService,
    stateSync: StateSyncService,
    config: ClusterHealthConfig,
    logger: Logger
  ) {
    this.leaderElection = leaderElection;
    this.stateSync = stateSync;
    this.config = {
      heartbeatInterval: 5000, // 5 seconds
      nodeTimeout: 15000, // 15 seconds
      ...config,
    };
    this.logger = logger.child({ component: 'ClusterHealth' });
    this.startedAt = new Date();
  }

  /**
   * Start the cluster health service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting cluster health service');

    // Register this node immediately
    await this.sendHeartbeat();

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.config.heartbeatInterval
    );
  }

  /**
   * Stop the cluster health service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping cluster health service');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Remove this node from the cluster
    await this.stateSync.delete(StateNamespaces.node(this.config.instanceId));
  }

  /**
   * Get the current cluster health status
   */
  async getClusterHealth(): Promise<ClusterHealth> {
    const nodeKeys = await this.stateSync.keys('node:*');
    const nodes: NodeInfo[] = [];
    const now = new Date();
    let healthyCount = 0;

    for (const key of nodeKeys) {
      const nodeInfo = await this.stateSync.get<NodeInfo>(key);
      if (nodeInfo) {
        // Check if node is still healthy based on heartbeat
        const lastHeartbeat = new Date(nodeInfo.lastHeartbeat);
        const timeSinceHeartbeat = now.getTime() - lastHeartbeat.getTime();

        if (timeSinceHeartbeat > this.config.nodeTimeout) {
          nodeInfo.status = 'unhealthy';
        } else {
          nodeInfo.status = 'healthy';
          healthyCount++;
        }

        // Update leader status
        nodeInfo.isLeader = nodeInfo.instanceId === this.leaderElection.getLeaderId();
        nodes.push(nodeInfo);
      }
    }

    // Sort nodes: leader first, then by instanceId
    nodes.sort((a, b) => {
      if (a.isLeader) return -1;
      if (b.isLeader) return 1;
      return a.instanceId.localeCompare(b.instanceId);
    });

    return {
      healthy: healthyCount > 0 && this.leaderElection.getLeaderId() !== null,
      nodeCount: nodes.length,
      healthyNodeCount: healthyCount,
      leaderId: this.leaderElection.getLeaderId(),
      thisNode: this.config.instanceId,
      isLeader: this.leaderElection.isLeader(),
      nodes,
      lastUpdated: now,
    };
  }

  /**
   * Get info about this node
   */
  getThisNodeInfo(): NodeInfo {
    return {
      instanceId: this.config.instanceId,
      hostname: this.config.hostname,
      port: this.config.port,
      startedAt: this.startedAt,
      lastHeartbeat: new Date(),
      isLeader: this.leaderElection.isLeader(),
      status: 'healthy',
      metrics: this.collectMetrics(),
    };
  }

  /**
   * Get info about a specific node
   */
  async getNodeInfo(instanceId: string): Promise<NodeInfo | null> {
    return this.stateSync.get<NodeInfo>(StateNamespaces.node(instanceId));
  }

  /**
   * Check if the cluster has a quorum
   */
  async hasQuorum(minimumNodes: number = 2): Promise<boolean> {
    const health = await this.getClusterHealth();
    return health.healthyNodeCount >= minimumNodes && health.leaderId !== null;
  }

  private async sendHeartbeat(): Promise<void> {
    const nodeInfo = this.getThisNodeInfo();
    const key = StateNamespaces.node(this.config.instanceId);

    try {
      // Store with TTL slightly longer than timeout
      await this.stateSync.set(key, nodeInfo, this.config.nodeTimeout * 2);
      this.logger.debug('Heartbeat sent');
    } catch (error) {
      this.logger.error({ error }, 'Failed to send heartbeat');
    }
  }

  private collectMetrics(): NodeInfo['metrics'] {
    const memUsage = process.memoryUsage();
    return {
      memoryUsage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      // CPU usage would require more complex tracking
    };
  }
}

/**
 * Create a cluster health service
 */
export function createClusterHealth(
  leaderElection: LeaderElectionService,
  stateSync: StateSyncService,
  config: ClusterHealthConfig,
  logger: Logger
): ClusterHealthService {
  return new ClusterHealthService(leaderElection, stateSync, config, logger);
}
