import os from 'node:os';
import { type AgentResponse, ParallaxAgent } from '@parallaxai/sdk-typescript';
import express from 'express';

/**
 * Managed Cloud Agent
 *
 * Runs inside K8s as a managed agent. Provides system-metrics and
 * edge-compute capabilities, complementing the self-registered Pi5 agent
 * in the EdgeCloudCoordination pattern.
 *
 * Runs both:
 * - gRPC server (port 8081) for agent protocol / pattern engine
 * - HTTP server (port 8080) for K8s readiness/liveness probes
 */
class ManagedCloudAgent extends ParallaxAgent {
  constructor() {
    super(
      process.env.AGENT_ID || `cloud-${os.hostname()}`,
      process.env.AGENT_NAME || 'Demo Cloud Agent',
      ['system-metrics', 'edge-compute'],
      {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        type: 'managed',
        location: 'cloud',
        environment: 'kubernetes',
      }
    );
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    const lower = task.toLowerCase();

    // Text analysis capabilities
    if (lower.includes('word count') || lower.includes('analyze text')) {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const words = text.split(/\s+/).length;
      const chars = text.length;
      const sentences = text.split(/[.!?]+/).filter(Boolean).length;
      return this.createResult(
        { words, characters: chars, sentences },
        0.95,
        'Exact character and word counting performed on input text'
      );
    }

    // Computation capabilities
    if (lower.includes('compute') || lower.includes('calculate')) {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const numbers = text.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
      const sum = numbers.reduce((a: number, b: number) => a + b, 0);
      const avg = numbers.length > 0 ? sum / numbers.length : 0;
      return this.createResult(
        { numbers, sum, average: avg, count: numbers.length },
        0.99,
        'Deterministic arithmetic computation'
      );
    }

    // System metrics
    if (lower.includes('system') || lower.includes('metrics')) {
      const cpus = os.cpus();
      return this.createResult(
        {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          uptime_seconds: os.uptime(),
          cpu: {
            model: cpus[0]?.model || 'unknown',
            cores: cpus.length,
            speed_mhz: cpus[0]?.speed || 0,
          },
          memory: {
            total_mb: Math.round(os.totalmem() / 1024 / 1024),
            free_mb: Math.round(os.freemem() / 1024 / 1024),
            used_percent: Math.round(
              ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
            ),
          },
          environment: 'kubernetes',
        },
        0.98,
        'Cloud system metrics collected from Kubernetes pod'
      );
    }

    // Default: echo with metadata
    return this.createResult(
      {
        echo: task,
        processed_by: this.name,
        environment: 'kubernetes',
        hostname: os.hostname(),
      },
      0.8,
      'Default echo response — no specific capability matched'
    );
  }
}

function startHealthServer(httpPort: number) {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
  });
  app.listen(httpPort, '0.0.0.0', () => {
    console.log(`Health endpoint listening on HTTP port ${httpPort}`);
  });
}

async function main() {
  const agent = new ManagedCloudAgent();

  // Start HTTP health server for K8s probes (port 8080)
  const httpPort = parseInt(process.env.HEALTH_PORT || '8080', 10);
  startHealthServer(httpPort);

  // Start gRPC server and register with control plane
  const grpcPort = parseInt(process.env.AGENT_PORT || '8081', 10);
  const registryEndpoint = process.env.PARALLAX_REGISTRY;

  console.log('Starting Managed Cloud Agent...');
  console.log(`  Registry: ${registryEndpoint || 'localhost:50051'}`);

  const actualPort = await agent.serve(grpcPort, { registryEndpoint });
  console.log(`Managed Cloud Agent gRPC server on port ${actualPort}`);

  const shutdown = async () => {
    console.log('Shutting down Managed Cloud Agent...');
    await agent.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
