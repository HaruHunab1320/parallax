/**
 * High Availability Module
 *
 * Provides clustering, leader election, distributed locking, and state
 * synchronization for multi-instance control plane deployments.
 */

export {
  ClusterHealth,
  ClusterHealthConfig,
  ClusterHealthService,
  createClusterHealth,
  NodeInfo,
} from './cluster-health';

export {
  createDistributedLock,
  DistributedLockConfig,
  DistributedLockService,
  Lock,
  LockOptions,
  LockResources,
} from './distributed-lock';
export {
  createLeaderElection,
  LeaderElectionConfig,
  LeaderElectionService,
  LeaderInfo,
} from './leader-election';
export {
  createStateSync,
  StateChangeEvent,
  StateNamespaces,
  StateSyncConfig,
  StateSyncService,
} from './state-sync';

import type { Logger } from 'pino';
import {
  type ClusterHealthService,
  createClusterHealth,
} from './cluster-health';
import {
  createDistributedLock,
  type DistributedLockService,
} from './distributed-lock';
import {
  createLeaderElection,
  type LeaderElectionService,
} from './leader-election';
import { createStateSync, type StateSyncService } from './state-sync';

export interface HAConfig {
  /** Enable HA features */
  enabled: boolean;
  /** etcd endpoints for leader election */
  etcdEndpoints: string[];
  /** Redis URL for state sync and locking */
  redisUrl: string;
  /** Instance ID (auto-generated if not provided) */
  instanceId?: string;
  /** Hostname for this instance */
  hostname?: string;
  /** Port for this instance */
  port?: number;
}

export interface HAServices {
  leaderElection: LeaderElectionService;
  lock: DistributedLockService;
  stateSync: StateSyncService;
  clusterHealth: ClusterHealthService;
}

/**
 * Initialize all HA services
 */
export async function initializeHA(
  config: HAConfig,
  logger: Logger
): Promise<HAServices | null> {
  if (!config.enabled) {
    logger.info('HA features disabled');
    return null;
  }

  const log = logger.child({ component: 'HA' });
  log.info('Initializing HA services');

  const instanceId = config.instanceId || `cp-${process.pid}`;

  // Create services
  const leaderElection = createLeaderElection(config.etcdEndpoints, logger, {
    instanceId,
  });

  const lock = createDistributedLock(config.redisUrl, logger);

  const stateSync = createStateSync(config.redisUrl, instanceId, logger);

  const clusterHealth = createClusterHealth(
    leaderElection,
    stateSync,
    {
      instanceId,
      hostname: config.hostname || 'localhost',
      port: config.port || 3000,
    },
    logger
  );

  // Start services
  await leaderElection.start();
  await stateSync.start();
  await clusterHealth.start();

  // Log leadership changes
  leaderElection.on('elected', () => {
    log.info('This instance is now the leader');
  });

  leaderElection.on('demoted', () => {
    log.info('This instance is no longer the leader');
  });

  leaderElection.on('leader-changed', (leaderId) => {
    log.info({ leaderId }, 'Cluster leader changed');
  });

  log.info({ instanceId }, 'HA services initialized');

  return {
    leaderElection,
    lock,
    stateSync,
    clusterHealth,
  };
}

/**
 * Shutdown all HA services
 */
export async function shutdownHA(services: HAServices | null): Promise<void> {
  if (!services) {
    return;
  }

  await services.clusterHealth.stop();
  await services.stateSync.close();
  await services.lock.close();
  await services.leaderElection.close();
}
