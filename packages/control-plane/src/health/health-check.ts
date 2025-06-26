/**
 * Health check endpoints for Parallax services
 */

import { Request, Response, Router } from 'express';
import { PatternEngine } from '../pattern-engine';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    [key: string]: {
      status: 'up' | 'down';
      message?: string;
      lastCheck?: string;
    };
  };
  version: string;
}

export class HealthCheckService {
  constructor(
    private patternEngine: PatternEngine,
    private runtimeManager: RuntimeManager,
    private registry: EtcdRegistry,
    private logger: Logger
  ) {}
  
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkPatternEngine(),
      this.checkRuntimeManager(),
      this.checkRegistry()
    ]);
    
    const [patternEngineCheck, runtimeCheck, registryCheck] = checks;
    
    const services: HealthStatus['services'] = {
      patternEngine: this.getServiceStatus(patternEngineCheck),
      runtime: this.getServiceStatus(runtimeCheck),
      registry: this.getServiceStatus(registryCheck)
    };
    
    // Determine overall status
    const statuses = Object.values(services).map(s => s.status);
    let overallStatus: HealthStatus['status'] = 'healthy';
    
    if (statuses.every(s => s === 'down')) {
      overallStatus = 'unhealthy';
    } else if (statuses.some(s => s === 'down')) {
      overallStatus = 'degraded';
    }
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      version: process.env.npm_package_version || '0.1.0'
    };
  }
  
  private async checkPatternEngine(): Promise<void> {
    const patterns = this.patternEngine.getPatterns();
    if (patterns.length === 0) {
      throw new Error('No patterns loaded');
    }
  }
  
  private async checkRuntimeManager(): Promise<void> {
    // Check if runtime can execute a simple script
    const testScript = 'result = 1 + 1\nresult ~> 1.0';
    await this.runtimeManager.executePrismScript(testScript, {});
  }
  
  private async checkRegistry(): Promise<void> {
    // Check if we can list services
    await this.registry.listServices();
  }
  
  private getServiceStatus(
    result: PromiseSettledResult<void>
  ): HealthStatus['services'][string] {
    if (result.status === 'fulfilled') {
      return {
        status: 'up',
        lastCheck: new Date().toISOString()
      };
    } else {
      return {
        status: 'down',
        message: result.reason?.message || 'Unknown error',
        lastCheck: new Date().toISOString()
      };
    }
  }
}

export function createHealthRouter(
  healthService: HealthCheckService,
  logger: Logger
): Router {
  const router = Router();
  
  // Basic health check (for load balancers)
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      
      if (health.status === 'unhealthy') {
        res.status(503).json(health);
      } else {
        res.status(200).json(health);
      }
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Liveness probe (is the service running?)
  router.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });
  
  // Readiness probe (is the service ready to accept traffic?)
  router.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      
      if (health.status === 'healthy') {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: health.status });
      }
    } catch (error) {
      res.status(503).json({ 
        ready: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  return router;
}