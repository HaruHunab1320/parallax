import { ParallaxAgent } from '@parallaxai/sdk-typescript';
import { AgentResponse } from '@parallaxai/sdk-typescript';
import os from 'os';

/**
 * Pi 5 self-registering agent.
 *
 * Provides system-metrics and edge-compute capabilities that complement
 * the managed cloud agent, demonstrating the BYOA (Bring Your Own Agent)
 * registration model.
 */
class Pi5Agent extends ParallaxAgent {
  constructor() {
    super(
      process.env.AGENT_ID || `pi5-${os.hostname()}`,
      process.env.AGENT_NAME || 'Pi 5 Edge Agent',
      ['system-metrics', 'edge-compute', 'latency-probe'],
      {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        type: 'self-registered',
        location: process.env.AGENT_LOCATION || 'edge',
      }
    );
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    const lower = task.toLowerCase();

    if (lower.includes('system') || lower.includes('metrics')) {
      return this.collectSystemMetrics();
    }

    if (lower.includes('latency') || lower.includes('ping')) {
      return this.measureLatency(data?.target);
    }

    if (lower.includes('compute') || lower.includes('benchmark')) {
      return this.edgeBenchmark();
    }

    // Default: return system summary with the task echo
    return this.createResult(
      {
        echo: task,
        agent: this.name,
        hostname: os.hostname(),
        platform: `${os.platform()}/${os.arch()}`,
      },
      0.8,
      'Default echo response from Pi 5 edge agent'
    );
  }

  private collectSystemMetrics(): AgentResponse {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();

    const metrics = {
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
        total_mb: Math.round(totalMem / 1024 / 1024),
        free_mb: Math.round(freeMem / 1024 / 1024),
        used_percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      load_average: {
        '1m': loadAvg[0],
        '5m': loadAvg[1],
        '15m': loadAvg[2],
      },
    };

    return this.createResult(
      metrics,
      0.99,
      'Real-time system metrics collected from host OS'
    );
  }

  private measureLatency(target?: string): AgentResponse {
    const start = process.hrtime.bigint();
    // Simulate a local computation latency measurement
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sqrt(i);
    }
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms

    return this.createResult(
      {
        target: target || 'local-compute',
        latency_ms: Math.round(elapsed * 100) / 100,
        iterations: 100000,
        result_checksum: sum,
      },
      0.95,
      'Compute latency measured via sqrt benchmark loop'
    );
  }

  private edgeBenchmark(): AgentResponse {
    const iterations = 1_000_000;
    const start = process.hrtime.bigint();

    let result = 0;
    for (let i = 0; i < iterations; i++) {
      result += Math.sin(i) * Math.cos(i);
    }

    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    const opsPerSec = Math.round(iterations / (elapsed / 1000));

    return this.createResult(
      {
        benchmark: 'sin-cos-multiply',
        iterations,
        duration_ms: Math.round(elapsed * 100) / 100,
        ops_per_second: opsPerSec,
        result_checksum: result,
        hardware: {
          cpu: os.cpus()[0]?.model || 'unknown',
          cores: os.cpus().length,
          arch: os.arch(),
        },
      },
      0.97,
      'Edge compute benchmark completed — deterministic floating-point workload'
    );
  }
}

async function main() {
  const agent = new Pi5Agent();

  const port = parseInt(process.env.AGENT_PORT || '0', 10);
  const registryEndpoint = process.env.PARALLAX_REGISTRY;

  console.log('Starting Pi 5 Edge Agent...');
  console.log(`  Registry: ${registryEndpoint || 'localhost:50051'}`);
  console.log(`  Host:     ${process.env.PARALLAX_AGENT_HOST || '127.0.0.1'}`);

  const actualPort = await agent.serve(port, { registryEndpoint });
  console.log(`Pi 5 agent serving on port ${actualPort}`);

  const shutdown = async () => {
    console.log('Shutting down Pi 5 agent...');
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
