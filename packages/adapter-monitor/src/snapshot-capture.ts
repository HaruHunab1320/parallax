/**
 * Snapshot Capture
 *
 * Captures CLI startup snapshots in isolated Docker containers.
 */

import type {
  AdapterType,
  StartupSnapshot,
  CaptureOptions,
  DetectedPattern,
} from './types';
import { MONITORED_CLIS, DEFAULT_CAPTURE_OPTIONS } from './config';

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Analyze output for patterns
 */
function analyzePatterns(lines: string[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Ready indicators
    if (/ready|help you|what would you like|type your message/i.test(line)) {
      patterns.push({
        type: 'ready',
        text: line,
        lineNumber: i + 1,
        confidence: 0.8,
      });
    }

    // Prompt patterns (lines ending with > or >>)
    if (/[a-z]+>\s*$/i.test(line)) {
      patterns.push({
        type: 'prompt',
        text: line,
        regex: line.match(/([a-z]+)>\s*$/i)?.[1] + '>\\s*$',
        lineNumber: i + 1,
        confidence: 0.9,
      });
    }

    // Auth patterns
    if (/api.?key|sign.?in|auth|login|credential/i.test(line)) {
      patterns.push({
        type: 'auth',
        text: line,
        lineNumber: i + 1,
        confidence: 0.85,
      });
    }

    // Blocking prompts (y/n, selections)
    if (/\[y\/n\]|\(y\/n\)|yes\/no|\d+\)/i.test(line)) {
      patterns.push({
        type: 'blocking',
        text: line,
        lineNumber: i + 1,
        confidence: 0.9,
      });
    }

    // Update notices
    if (/update|upgrade|new version|available/i.test(line)) {
      patterns.push({
        type: 'update',
        text: line,
        lineNumber: i + 1,
        confidence: 0.7,
      });
    }
  }

  return patterns;
}

/**
 * Generate Dockerfile for CLI capture
 */
function generateDockerfile(adapter: AdapterType): string {
  const source = MONITORED_CLIS[adapter];

  const baseImage = source.registry === 'pip' ? 'python:3.11-slim' : 'node:20-slim';

  return `
FROM ${baseImage}

# Create non-root user with clean home directory
RUN useradd -m -s /bin/bash testuser

# Switch to testuser
USER testuser
WORKDIR /home/testuser

# Ensure clean environment - no existing configs
ENV HOME=/home/testuser
ENV XDG_CONFIG_HOME=/home/testuser/.config

# Install the CLI
${source.registry === 'pip' ? 'RUN pip install --user ' + source.package : 'RUN npm install -g ' + source.package}

# Add local bin to PATH
ENV PATH="/home/testuser/.local/bin:/home/testuser/.npm-global/bin:$PATH"

# Copy capture script
COPY --chown=testuser:testuser capture.sh /home/testuser/capture.sh
RUN chmod +x /home/testuser/capture.sh

# Run capture
CMD ["/bin/bash", "/home/testuser/capture.sh"]
`.trim();
}

/**
 * Generate capture script that runs inside the container
 */
function generateCaptureScript(adapter: AdapterType, timeout: number): string {
  const source = MONITORED_CLIS[adapter];

  return `#!/bin/bash
set -e

# Output marker for parsing
echo "===CAPTURE_START==="

# Run the CLI with a timeout, capturing output
# Use script command to capture PTY output
timeout ${Math.floor(timeout / 1000)}s script -q -c "${source.command}" /dev/null 2>&1 || true

echo "===CAPTURE_END==="
`.trim();
}

/**
 * Capture startup snapshot using Docker
 */
export async function captureWithDocker(
  adapter: AdapterType,
  version: string,
  options: CaptureOptions = {}
): Promise<StartupSnapshot> {
  const opts = { ...DEFAULT_CAPTURE_OPTIONS, ...options };
  const startTime = Date.now();

  // Dynamic import of dockerode
  const Docker = (await import('dockerode')).default;
  const docker = new Docker();

  const dockerfile = generateDockerfile(adapter);
  const captureScript = generateCaptureScript(adapter, opts.timeout || 30000);

  // Create build context with tar-stream
  const tar = await import('tar-stream');
  const pack = tar.pack();

  pack.entry({ name: 'Dockerfile' }, dockerfile);
  pack.entry({ name: 'capture.sh' }, captureScript);
  pack.finalize();

  // Build the image
  const imageName = `adapter-monitor-${adapter}:${version.replace(/\./g, '-')}`;

  console.log(`Building Docker image for ${adapter}@${version}...`);

  const stream = await docker.buildImage(pack as unknown as NodeJS.ReadableStream, {
    t: imageName,
  });

  // Wait for build to complete
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`Running capture container...`);

  // Run the container and capture output
  const container = await docker.createContainer({
    Image: imageName,
    Tty: true,
    AttachStdout: true,
    AttachStderr: true,
  });

  await container.start();

  // Collect output
  let rawOutput = '';
  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
  });

  await new Promise<void>((resolve) => {
    logStream.on('data', (chunk: Buffer) => {
      rawOutput += chunk.toString();
    });

    logStream.on('end', resolve);

    // Timeout safety
    setTimeout(() => {
      container.stop().catch(() => {});
      resolve();
    }, (opts.timeout || 30000) + 5000);
  });

  // Cleanup
  await container.remove({ force: true }).catch(() => {});
  await docker.getImage(imageName).remove({ force: true }).catch(() => {});

  const captureDurationMs = Date.now() - startTime;

  // Parse output
  const strippedOutput = stripAnsi(rawOutput);
  const lines = strippedOutput.split('\n').filter((l) => l.trim());
  const patterns = analyzePatterns(lines);

  const authRequired = patterns.some((p) => p.type === 'auth');
  const reachedReady = patterns.some((p) => p.type === 'ready' || p.type === 'prompt');

  return {
    adapter,
    version,
    timestamp: new Date().toISOString(),
    captureDurationMs,
    rawOutput,
    strippedOutput,
    lines,
    patterns,
    authRequired,
    reachedReady,
  };
}

/**
 * Capture startup snapshot locally (without Docker)
 * Useful for testing but less isolated
 */
export async function captureLocally(
  adapter: AdapterType,
  version: string,
  options: CaptureOptions = {}
): Promise<StartupSnapshot> {
  const opts = { ...DEFAULT_CAPTURE_OPTIONS, ...options };
  const startTime = Date.now();
  const source = MONITORED_CLIS[adapter];

  // Use child_process to run the CLI
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    let rawOutput = '';

    const proc = spawn(source.command, [], {
      shell: true,
      env: {
        ...process.env,
        ...opts.env,
        // Clear auth env vars
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        GOOGLE_API_KEY: '',
        GEMINI_API_KEY: '',
      },
    });

    proc.stdout?.on('data', (data: Buffer) => {
      rawOutput += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      rawOutput += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, opts.timeout || 30000);

    proc.on('close', () => {
      clearTimeout(timeout);

      const captureDurationMs = Date.now() - startTime;
      const strippedOutput = stripAnsi(rawOutput);
      const lines = strippedOutput.split('\n').filter((l) => l.trim());
      const patterns = analyzePatterns(lines);

      const authRequired = patterns.some((p) => p.type === 'auth');
      const reachedReady = patterns.some((p) => p.type === 'ready' || p.type === 'prompt');

      resolve({
        adapter,
        version,
        timestamp: new Date().toISOString(),
        captureDurationMs,
        rawOutput,
        strippedOutput,
        lines,
        patterns,
        authRequired,
        reachedReady,
      });
    });

    proc.on('error', reject);
  });
}

/**
 * Capture startup snapshot (auto-selects Docker or local)
 */
export async function captureSnapshot(
  adapter: AdapterType,
  version: string,
  options: CaptureOptions = {}
): Promise<StartupSnapshot> {
  const opts = { ...DEFAULT_CAPTURE_OPTIONS, ...options };

  if (opts.useDocker) {
    return captureWithDocker(adapter, version, opts);
  } else {
    return captureLocally(adapter, version, opts);
  }
}
