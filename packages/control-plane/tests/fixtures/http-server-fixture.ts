import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { getTestPrisma } from '../setup';

export async function createTestAdminToken(): Promise<string> {
  const user = await getTestPrisma().user.create({
    data: { email: 'api-admin@example.test', role: 'admin', status: 'active' },
  });
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: 3600 }
  );
}

export async function startHttpServer(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), 'parallax-http-test-'));
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'tests/fixtures/http-server.ts'],
    {
      cwd: path.resolve(__dirname, '../..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        PORT: '0',
        GRPC_PORT: '0',
        PARALLAX_AUTH_MODE: 'required',
        PARALLAX_GRPC_TLS_ENABLED: 'false',
        PARALLAX_HTTP_HOST: '127.0.0.1',
        PARALLAX_GRPC_HOST: '127.0.0.1',
        PARALLAX_PATTERNS_DIR: directory,
        PARALLAX_TRACING_ENABLED: 'false',
        OTEL_TRACES_EXPORTER: 'none',
        PARALLAX_HA_ENABLED: 'false',
        PARALLAX_SHUTDOWN_DRAIN_TIMEOUT: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  // Keep startup diagnostics bounded. The fixture emits no credentials.
  let diagnostics = '';
  child.stderr?.on('data', (chunk) => {
    diagnostics = (diagnostics + String(chunk)).slice(-4000);
  });
  child.stdout?.resume();
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      await once(child, 'exit');
      clearTimeout(force);
    }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('HTTP test server startup timed out')),
        20000
      );
      const fail = () => {
        clearTimeout(timeout);
        reject(new Error(`HTTP test server failed to start: ${diagnostics}`));
      };
      child.once('error', fail);
      child.once('exit', fail);
      child.on('message', (message: { type?: string; url?: string }) => {
        if (message.type === 'ready' && message.url) {
          clearTimeout(timeout);
          resolve(message.url);
        } else if (message.type === 'startup-error') fail();
      });
    });
    return { url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
