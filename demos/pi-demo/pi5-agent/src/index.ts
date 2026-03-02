import { ParallaxAgent } from '@parallaxai/sdk-typescript';
import { AgentResponse } from '@parallaxai/sdk-typescript';
import os from 'os';
import { TamagotchiDisplay } from './display/tamagotchi';
import { TamagotchiState } from './display/types';

/**
 * Pi 5 self-registering agent.
 *
 * Provides system-metrics and edge-compute capabilities that complement
 * the managed cloud agent, demonstrating the BYOA (Bring Your Own Agent)
 * registration model.
 */
class Pi5Agent extends ParallaxAgent {
  readonly display = new TamagotchiDisplay();

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

    // Display: receiving
    this.display.setState(TamagotchiState.RECEIVING);
    this.display.addTextLine(`> ${task.slice(0, 12)}`);

    // Pick working vs thinking based on task type
    const isHeavy = lower.includes('compute') || lower.includes('benchmark');
    // Brief pause to show receiving animation
    await new Promise((r) => setTimeout(r, 500));
    this.display.setState(isHeavy ? TamagotchiState.WORKING : TamagotchiState.THINKING);

    try {
      let result: AgentResponse;

      if (lower.includes('system') || lower.includes('metrics')) {
        result = this.collectSystemMetrics();
      } else if (lower.includes('latency') || lower.includes('ping')) {
        result = this.measureLatency(data?.target);
      } else if (lower.includes('compute') || lower.includes('benchmark')) {
        result = this.edgeBenchmark();
      } else {
        result = this.createResult(
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

      // Display: responding
      this.display.setState(TamagotchiState.RESPONDING);
      this.display.addTextLine(`< conf:${result.confidence.toFixed(2)}`);

      return result;
    } catch (err: any) {
      this.display.setState(TamagotchiState.ERROR);
      this.display.addTextLine(`! ${(err.message || 'error').slice(0, 12)}`);
      throw err;
    }
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

  // Start tamagotchi display
  agent.display.start();
  agent.display.addTextLine('* booting...');

  // Heartbeat indicator on lease renewal interval
  let leaseCount = 0;
  const heartbeat = setInterval(() => {
    leaseCount++;
    agent.display.updateLastMatchingLine('\x03 lease', `\x03 lease x${leaseCount}`);
  }, 30_000);

  const port = parseInt(process.env.AGENT_PORT || '0', 10);
  const registryEndpoint = process.env.PARALLAX_REGISTRY;

  console.log('Starting Pi 5 Edge Agent...');
  console.log(`  Registry: ${registryEndpoint || 'localhost:50051'}`);
  console.log(`  Host:     ${process.env.PARALLAX_AGENT_HOST || '127.0.0.1'}`);

  const actualPort = await agent.serve(port, { registryEndpoint });
  console.log(`Pi 5 agent serving on port ${actualPort}`);
  agent.display.addTextLine('* ready');

  const shutdown = async () => {
    console.log('Shutting down Pi 5 agent...');
    clearInterval(heartbeat);
    agent.display.stop();
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
