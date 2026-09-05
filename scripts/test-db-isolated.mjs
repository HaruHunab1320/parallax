#!/usr/bin/env node
/** Runs database tests against disposable infrastructure, without reading .env. */
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const suffix = randomUUID().slice(0, 8);
const postgresName = `parallax-db-test-${suffix}`;
const etcdName = `parallax-etcd-test-${suffix}`;
const password = randomBytes(32).toString('hex');
const containers = [];
let child;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
}

async function docker(...args) {
  return (await exec('docker', args, { timeout: 120000 })).stdout.trim();
}

try {
  await docker('run', '--detach', '--rm', '--name', postgresName,
    '--publish', '127.0.0.1::5432', '--env', `POSTGRES_PASSWORD=${password}`,
    'postgres:16-alpine');
  containers.push(postgresName);
  await docker('run', '--detach', '--rm', '--name', etcdName,
    '--publish', '127.0.0.1::2379', 'quay.io/coreos/etcd:v3.5.9',
    'etcd', '--listen-client-urls=http://0.0.0.0:2379',
    '--advertise-client-urls=http://127.0.0.1:2379');
  containers.push(etcdName);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !interrupted; attempt++) {
    try {
      await docker('exec', postgresName, 'pg_isready', '-U', 'postgres');
      await docker('exec', etcdName, 'etcdctl', 'endpoint', 'health');
      ready = true;
      break;
    } catch { await delay(500); }
  }
  if (!ready) throw new Error('Disposable database infrastructure did not become ready');
  const postgresAddress = await docker('port', postgresName, '5432/tcp');
  const etcdAddress = await docker('port', etcdName, '2379/tcp');
  console.log('Running migrations and tests in a fresh disposable database.');
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  child = spawn('pnpm', ['--filter', '@parallaxai/control-plane', 'test:db', ...args], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_DATABASE_ADMIN_URL: `postgresql://postgres:${password}@${postgresAddress}/postgres`,
      PARALLAX_ETCD_ENDPOINTS: etcdAddress,
      JWT_SECRET: randomBytes(32).toString('hex'),
      PARALLAX_GRPC_API_KEY: randomBytes(32).toString('hex'),
      PARALLAX_LICENSE_KEY: '', PARALLAX_LICENSE_PUBLIC_KEY: '',
      NODE_ENV: 'test',
      PARALLAX_AUTH_MODE: 'required',
      PARALLAX_GRPC_TLS_ENABLED: 'false',
      PARALLAX_HA_ENABLED: 'false',
      PARALLAX_LOCAL_AGENTS: '',
      PORT: '0', GRPC_PORT: '0',
      PARALLAX_HTTP_HOST: '127.0.0.1', PARALLAX_GRPC_HOST: '127.0.0.1',
    },
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  process.exitCode = code;
} catch (error) {
  // Docker error objects include command arguments. Never print the generated
  // ephemeral database password as part of an error object.
  console.error(`Isolated database tests failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`.replaceAll(password, '[redacted]'));
  process.exitCode = 1;
} finally {
  await Promise.all(containers.map(async (name) => {
    try { await docker('rm', '--force', name); }
    catch { console.error(`Could not remove disposable container ${name}; remove it manually.`); process.exitCode = 1; }
  }));
}
