import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParallaxHttpClient } from '../utils/http-client';

type AgentSpec = {
  id: string;
  name: string;
  capabilities: string[];
  filename: string;
  summary: string;
};

const AGENTS: AgentSpec[] = [
  {
    id: 'architect',
    name: 'Systems Architect',
    capabilities: ['planning', 'architecture'],
    filename: 'architect.ts',
    summary: 'Chooses stack + system plan'
  },
  {
    id: 'lead-dev',
    name: 'Lead Engineer',
    capabilities: ['planning', 'execution'],
    filename: 'lead-dev.ts',
    summary: 'Defines tasks + shards'
  },
  {
    id: 'engineer-1',
    name: 'Frontend Engineer',
    capabilities: ['frontend', 'implementation'],
    filename: 'engineer-1.ts',
    summary: 'Builds UI + canvas loop'
  },
  {
    id: 'engineer-2',
    name: 'Gameplay Engineer',
    capabilities: ['gameplay', 'implementation'],
    filename: 'engineer-2.ts',
    summary: 'Implements core mechanics'
  },
  {
    id: 'designer',
    name: 'UX Designer',
    capabilities: ['design', 'ux'],
    filename: 'designer.ts',
    summary: 'Defines layout + UX flow'
  },
  {
    id: 'qa',
    name: 'QA Engineer',
    capabilities: ['testing', 'validation'],
    filename: 'qa.ts',
    summary: 'Validates behavior'
  },
  {
    id: 'devops',
    name: 'DevOps Engineer',
    capabilities: ['devops', 'release'],
    filename: 'devops.ts',
    summary: 'Runbook + deployment notes'
  }
];

type ExecutionEvent = {
  type: string;
  executionId: string;
  data?: any;
  timestamp?: string;
};

export const demoCommand = new Command('demo')
  .description('Demo orchestration helpers');

demoCommand
  .command('golden-ticket')
  .description('Run the Golden Ticket demo end-to-end')
  .option('--dir <path>', 'Root directory to create demo under', process.cwd())
  .option('--name <name>', 'Demo folder name', 'doom-lite')
  .option('--port <port>', 'Control plane HTTP port', '3000')
  .option('--grpc-port <port>', 'Control plane gRPC port', '50051')
  .option('--db-port <port>', 'Postgres port', process.env.PARALLAX_DB_PORT || '5433')
  .option('--clean', 'Delete existing demo directory before generating')
  .option('--skip-sdk-build', 'Skip building the TypeScript SDK before starting agents')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(async (options) => {
    const spinner = ora('Preparing golden ticket demo...').start();
    const processes: ChildProcess[] = [];
    const exitSignals: Promise<never>[] = [];

    const rootDir = await resolveRepoRoot(path.resolve(options.dir));
    const demoDir = path.join(rootDir, 'demos', options.name);
    const patternsDir = path.join(demoDir, 'patterns');
    const agentsDir = path.join(demoDir, 'agents');
    const appDir = path.join(demoDir, 'app');
    const certsDir = path.join(demoDir, 'certs');
    const httpPort = Number(options.port);
    const grpcPort = Number(options.grpcPort);
    const dbPort = Number(options.dbPort);
    const dbHost = process.env.PARALLAX_DB_HOST || 'localhost';
    const dbUser = process.env.PARALLAX_DB_USER || 'postgres';
    const dbPassword = process.env.PARALLAX_DB_PASSWORD || 'postgres';
    const dbName = process.env.PARALLAX_DB_NAME || 'parallax';
    const useMtls = options.mtls !== false;
    const databaseUrl = process.env.DATABASE_URL
      ?? `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;

    try {
      const shutdown = (code = 1) => {
        processes.forEach(p => terminateProcess(p));
        setTimeout(() => {
          processes.forEach(p => forceKillProcess(p));
          process.exit(code);
        }, 3000);
      };

      process.on('SIGINT', () => shutdown(0));
      process.on('SIGTERM', () => shutdown(0));

      if (options.clean) {
        await safeRemoveDemoDir(demoDir, rootDir);
      }
      await fs.mkdir(demoDir, { recursive: true });
      await fs.mkdir(patternsDir, { recursive: true });
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.mkdir(appDir, { recursive: true });

      if (useMtls) {
        await ensureOpenSsl();
        await ensureCerts(certsDir);
      }

      await writeDemoApp(appDir);
      await writeAgentScripts(agentsDir);
      await copyGoldenTicketPatterns(patternsDir);

      if (!options.skipSdkBuild) {
        spinner.text = 'Building TypeScript SDK...';
        const cleanResult = spawnSync('pnpm', ['--filter', '@parallax/sdk-typescript', 'clean'], {
          cwd: rootDir,
          stdio: 'inherit'
        });
        if (cleanResult.error) {
          throw cleanResult.error;
        }
        if (cleanResult.status !== 0) {
          throw new Error('Failed to clean @parallax/sdk-typescript');
        }
        const generateResult = spawnSync('pnpm', ['--filter', '@parallax/sdk-typescript', 'generate'], {
          cwd: rootDir,
          stdio: 'inherit'
        });
        if (generateResult.error) {
          throw generateResult.error;
        }
        if (generateResult.status !== 0) {
          throw new Error('Failed to generate @parallax/sdk-typescript protos');
        }
        const buildResult = spawnSync('pnpm', ['--filter', '@parallax/sdk-typescript', 'build'], {
          cwd: rootDir,
          stdio: 'inherit'
        });
        if (buildResult.error) {
          throw buildResult.error;
        }
        if (buildResult.status !== 0) {
          throw new Error('Failed to build @parallax/sdk-typescript');
        }
      }

      spinner.text = 'Starting control plane...';
      const controlPlane = spawn(
        'pnpm',
        ['--filter', '@parallax/control-plane', 'exec', 'tsx', '--', 'src/server.ts'],
        {
        cwd: rootDir,
        env: {
          ...process.env,
          PORT: String(httpPort),
          GRPC_PORT: String(grpcPort),
          DATABASE_URL: databaseUrl,
          PARALLAX_ETCD_ENDPOINTS: process.env.PARALLAX_ETCD_ENDPOINTS || 'localhost:2379',
          PARALLAX_PATTERNS_DIR: patternsDir,
          NODE_ENV: process.env.NODE_ENV || 'development',
          ...(useMtls
            ? {
                PARALLAX_GRPC_TLS_ENABLED: 'true',
                PARALLAX_GRPC_TLS_CA: path.join(certsDir, 'ca.pem'),
                PARALLAX_GRPC_TLS_CERT: path.join(certsDir, 'control-plane.pem'),
                PARALLAX_GRPC_TLS_KEY: path.join(certsDir, 'control-plane-key.pem'),
                PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT: 'true',
                PARALLAX_AGENT_MTLS_ENABLED: 'true',
                PARALLAX_AGENT_MTLS_CA: path.join(certsDir, 'ca.pem'),
                PARALLAX_AGENT_MTLS_CERT: path.join(certsDir, 'control-plane-client.pem'),
                PARALLAX_AGENT_MTLS_KEY: path.join(certsDir, 'control-plane-client-key.pem')
              }
            : {})
        },
        stdio: 'inherit',
        detached: true
        }
      );
      processes.push(controlPlane);
      exitSignals.push(trackProcessExit(controlPlane, 'Control plane'));

      await Promise.race([
        waitForService(`http://localhost:${httpPort}/health`, 'Control Plane'),
        ...exitSignals
      ]);

      spinner.text = 'Starting agents...';
      for (const agent of AGENTS) {
        const agentFile = path.join(agentsDir, agent.filename);
        const child = spawn(
          'pnpm',
          ['--filter', '@parallax/cli', 'exec', 'tsx', '--', agentFile],
          {
          cwd: rootDir,
          env: {
            ...process.env,
            PARALLAX_REGISTRY: `localhost:${grpcPort}`,
            PARALLAX_MTLS_ENABLED: useMtls ? 'true' : 'false',
            PARALLAX_MTLS_CERTS: certsDir,
            PARALLAX_SDK_PATH: path.join(rootDir, 'packages', 'sdk-typescript', 'dist', 'src', 'index.js'),
            PARALLAX_PROTO_DIR: path.join(rootDir, 'proto')
          },
          stdio: 'inherit',
          detached: true
          }
        );
        processes.push(child);
        exitSignals.push(trackProcessExit(child, `Agent ${agent.name}`));
      }

      const client = new ParallaxHttpClient({ baseURL: `http://localhost:${httpPort}` });
      await Promise.race([
        waitForAgents(client, AGENTS.length),
        ...exitSignals
      ]);

      if (process.env.NODE_ENV === 'development') {
        spinner.text = 'Reloading patterns...';
        await client.reloadPatterns();
      }

      spinner.succeed(chalk.green('Golden ticket demo environment ready'));

      const status = new Map<string, string>();
      const details = new Map<string, string>();
      AGENTS.forEach(agent => status.set(agent.name, 'idle'));

      const runPattern = async (patternName: string, input: any) => {
        console.log(chalk.cyan(`\n▶ Running pattern: ${patternName}`));
        const taskLabel = input?.task ? String(input.task) : 'Working';
        AGENTS.forEach(agent => {
          status.set(agent.name, 'running');
          details.set(agent.name, taskLabel);
        });
        renderStatus(status, details, { type: 'connected', executionId: '', timestamp: new Date() } as ExecutionEvent);
        const execution = await client.createExecution(patternName, input, { stream: true });
        const executionId = execution.id;

        await new Promise<void>((resolve) => {
          const ws = client.streamExecution(executionId, {
            onMessage: (message: ExecutionEvent) => {
              updateStatus(status, details, message);
              renderStatus(status, details, message);
              if (message.type === 'completed' || message.type === 'failed') {
                ws.close();
                resolve();
              }
            },
            onError: (error) => {
              console.error(chalk.red(`Stream error: ${error.message}`));
            }
          });
        });
      };

      await runPattern('SwarmOrchestrator', {
        task: 'Design and implement a doom-lite prototype',
        data: { projectDir: appDir }
      });

      await runPattern('SwarmShardMapReduce', {
        task: 'Shard work into UI, gameplay, and validation',
        data: { projectDir: appDir }
      });

      await runPattern('SwarmReviewConsensus', {
        task: 'Review implementation for quality',
        data: { projectDir: appDir }
      });

      await runPattern('SwarmTestLoop', {
        task: 'Validate doom-lite app functionality',
        data: { projectDir: appDir }
      });

      console.log(chalk.green('\n✅ Swarm run complete. Launching demo app...\n'));
      const appProcess = spawn('pnpm', ['dev'], {
        cwd: appDir,
        stdio: 'inherit',
        env: { ...process.env },
        detached: true
      });
      processes.push(appProcess);

      console.log(chalk.gray(`App directory: ${appDir}`));
      console.log(chalk.gray(`Open: http://localhost:5173`));
      console.log(chalk.yellow('\nPress Ctrl+C to stop the demo.\n'));
    } catch (error: any) {
      spinner.fail(chalk.red('Golden ticket demo failed'));
      console.error(error?.message || error);
      processes.forEach(p => terminateProcess(p));
      setTimeout(() => {
        processes.forEach(p => forceKillProcess(p));
        process.exit(1);
      }, 3000);
    }
  });

async function ensureOpenSsl(): Promise<void> {
  const result = spawnSync('openssl', ['version']);
  if (result.status !== 0) {
    throw new Error('OpenSSL is required for mTLS. Install OpenSSL or run with --no-mtls.');
  }
}

async function ensureCerts(certsDir: string): Promise<void> {
  const caPath = path.join(certsDir, 'ca.pem');
  try {
    await fs.access(caPath);
    return;
  } catch {
    // continue
  }

  await fs.mkdir(certsDir, { recursive: true });

  const run = (args: string[]) => {
    const result = spawnSync('openssl', args, { cwd: certsDir });
    if (result.status !== 0) {
      throw new Error(`OpenSSL failed: ${args.join(' ')}`);
    }
  };

  run(['genrsa', '-out', 'ca-key.pem', '2048']);
  run(['req', '-x509', '-new', '-nodes', '-key', 'ca-key.pem', '-sha256', '-days', '3650', '-subj', '/CN=Parallax CA', '-out', 'ca.pem']);

  const sanFile = path.join(certsDir, 'san.cnf');
  await fs.writeFile(
    sanFile,
    [
      '[v3_req]',
      'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ].join('\n')
  );

  generateSignedCert(run, 'control-plane', 'localhost', sanFile);
  generateSignedCert(run, 'agent-server', 'localhost', sanFile);
  generateSignedCert(run, 'agent-client', 'parallax-agent-client');
  generateSignedCert(run, 'control-plane-client', 'parallax-control-plane-client');
}

function generateSignedCert(
  run: (args: string[]) => void,
  name: string,
  commonName: string,
  extFile?: string
) {
  run(['genrsa', '-out', `${name}-key.pem`, '2048']);
  run(['req', '-new', '-key', `${name}-key.pem`, '-subj', `/CN=${commonName}`, '-out', `${name}.csr`]);
  const args = [
    'x509',
    '-req',
    '-in',
    `${name}.csr`,
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca-key.pem',
    '-CAcreateserial',
    '-out',
    `${name}.pem`,
    '-days',
    '3650',
    '-sha256'
  ];
  if (extFile) {
    args.push('-extfile', extFile, '-extensions', 'v3_req');
  }
  run(args);
}

async function writeDemoApp(appDir: string): Promise<void> {
  const pkg = {
    name: 'doom-lite',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'node server.js'
    }
  };

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Doom-lite</title>
    <style>
      body { margin: 0; background: #111; color: #eee; font-family: Arial, sans-serif; }
      canvas { display: block; margin: 0 auto; background: #000; }
      .hud { position: fixed; top: 12px; left: 12px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="hud">WASD to move. Demo build by Parallax swarm.</div>
    <canvas id="game" width="960" height="540"></canvas>
    <script src="./app.js"></script>
  </body>
</html>`;

  const appJs = `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const state = {
  player: { x: 120, y: 120, size: 18, speed: 3 },
  keys: new Set(),
  walls: [
    { x: 200, y: 80, w: 20, h: 200 },
    { x: 420, y: 260, w: 200, h: 20 },
    { x: 620, y: 120, w: 20, h: 260 }
  ]
};

window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

function movePlayer() {
  let dx = 0, dy = 0;
  if (state.keys.has('w')) dy -= state.player.speed;
  if (state.keys.has('s')) dy += state.player.speed;
  if (state.keys.has('a')) dx -= state.player.speed;
  if (state.keys.has('d')) dx += state.player.speed;

  state.player.x = Math.max(0, Math.min(canvas.width - state.player.size, state.player.x + dx));
  state.player.y = Math.max(0, Math.min(canvas.height - state.player.size, state.player.y + dy));
}

function draw() {
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#222';
  state.walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));

  ctx.fillStyle = '#f04';
  ctx.fillRect(state.player.x, state.player.y, state.player.size, state.player.size);
}

function loop() {
  movePlayer();
  draw();
  requestAnimationFrame(loop);
}

loop();`;

  const serverJs = `const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 5173;
const root = __dirname;

const server = http.createServer((req, res) => {
  const file = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(root, 'public', file);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.end(data);
  });
});

server.listen(port, () => {
  console.log('doom-lite running on http://localhost:' + port);
});`;

  await fs.mkdir(path.join(appDir, 'public'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify(pkg, null, 2));
  await fs.writeFile(path.join(appDir, 'public', 'index.html'), html);
  await fs.writeFile(path.join(appDir, 'public', 'app.js'), appJs);
  await fs.writeFile(path.join(appDir, 'server.js'), serverJs);
}

async function writeAgentScripts(agentsDir: string): Promise<void> {
  await Promise.all(
    AGENTS.map(async (agent) => {
      const filePath = path.join(agentsDir, agent.filename);
      const content = buildAgentScript(agent);
      await fs.writeFile(filePath, content);
    })
  );
}

function buildAgentScript(agent: AgentSpec): string {
  return `import path from 'path';
import { pathToFileURL } from 'url';

async function loadSdk() {
  const sdkPath = process.env.PARALLAX_SDK_PATH;
  if (sdkPath) {
    try {
      return await import(pathToFileURL(sdkPath).href);
    } catch (error) {
      console.error('Failed to import SDK from path:', sdkPath, error);
      throw error;
    }
  }
  return import('@parallax/sdk-typescript');
}

function buildResponse(task: string, data: any) {
  switch ('${agent.id}') {
    case 'architect':
      return {
        plan: {
          stack: 'vanilla-js + canvas + node http',
          rationale: 'Fast to implement, zero dependencies, demo-focused',
          steps: ['scaffold app', 'canvas loop', 'controls', 'static server']
        },
        shards: ['ui-canvas', 'gameplay-loop', 'input-handling', 'serving'],
        confidence: 0.9,
        reasoning: 'Selected minimal stack for fast delivery'
      };
    case 'lead-dev':
      return {
        summary: 'Break down work into UI, gameplay, QA, and devops tasks',
        shards: ['ui', 'gameplay', 'validation', 'runbook'],
        confidence: 0.86,
        reasoning: 'Delegated tasks for parallel execution'
      };
    case 'engineer-1':
      return {
        summary: 'Build canvas renderer + HUD',
        shards: ['canvas-render', 'hud-overlay'],
        confidence: 0.82,
        reasoning: 'Frontend plan ready'
      };
    case 'engineer-2':
      return {
        summary: 'Implement input + movement loop',
        shards: ['movement', 'collision'],
        confidence: 0.8,
        reasoning: 'Gameplay logic laid out'
      };
    case 'designer':
      return {
        notes: 'Simple HUD, dark palette, clear controls',
        confidence: 0.78,
        reasoning: 'Design notes prepared'
      };
    case 'qa':
      return {
        passed: true,
        tests: ['movement', 'render', 'server'],
        confidence: 0.88,
        reasoning: 'Checks green'
      };
    case 'devops':
      return {
        notes: 'Use node server.js; expose port 5173; log URL',
        confidence: 0.8,
        reasoning: 'Runbook drafted'
      };
    default:
      return { notes: 'General review', confidence: 0.7 };
  }
}

async function main() {
  console.log('Starting agent ${agent.name} (${agent.id})');
  console.log('Registry:', process.env.PARALLAX_REGISTRY || 'localhost:50051');
  console.log('mTLS:', process.env.PARALLAX_MTLS_ENABLED);
  if (process.env.PARALLAX_PROTO_DIR) {
    console.log('Proto dir:', process.env.PARALLAX_PROTO_DIR);
  }
  if (process.env.PARALLAX_SDK_PATH) {
    console.log('SDK path:', process.env.PARALLAX_SDK_PATH);
  }

  const sdk = await loadSdk();
  console.log('SDK loaded for ${agent.name}');
  const { SecureParallaxAgent, serveSecureAgent } = sdk as any;

  class ${camel(agent.id)}Agent extends SecureParallaxAgent {
    constructor() {
      const certsDir = process.env.PARALLAX_MTLS_CERTS || path.join(__dirname, '..', 'certs');
      const mtlsEnabled = process.env.PARALLAX_MTLS_ENABLED === 'true';
      super(
        '${agent.id}',
        '${agent.name}',
        ${JSON.stringify(agent.capabilities)},
        { role: '${agent.id}', summary: '${agent.summary}' },
        mtlsEnabled ? {
          enabled: true,
          certsDir,
          caFile: 'ca.pem',
          certFile: 'agent-server.pem',
          keyFile: 'agent-server-key.pem',
          clientCertFile: 'agent-client.pem',
          clientKeyFile: 'agent-client-key.pem',
          checkClientCertificate: true
        } : undefined
      );
    }

    async analyze(task: string, data?: any) {
      const payload = buildResponse(task, data || {});
      return {
        value: payload,
        confidence: payload.confidence || 0.8,
        reasoning: payload.reasoning || 'Agent response'
      };
    }
  }

  const agent = new ${camel(agent.id)}Agent();
  console.log('Starting gRPC server for ${agent.name}');
  await serveSecureAgent(agent, 0, process.env.PARALLAX_REGISTRY);
  console.log('${agent.name} serving');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
}

function camel(value: string): string {
  return value
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function copyGoldenTicketPatterns(patternsDir: string): Promise<void> {
  const sourceDir = path.resolve(__dirname, '../../../../patterns/examples/golden-ticket');
  const entries = await fs.readdir(sourceDir);
  await Promise.all(
    entries.map(async (entry) => {
      const src = path.join(sourceDir, entry);
      const dest = path.join(patternsDir, entry);
      const stat = await fs.stat(src);
      if (stat.isFile()) {
        await fs.copyFile(src, dest);
      }
    })
  );
}

async function waitForService(url: string, name: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // ignore
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} failed to start`);
}

async function waitForAgents(client: ParallaxHttpClient, expected: number, maxRetries = 30): Promise<void> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const agents = await client.listAgents();
      const activeAgents = agents.filter(agent => {
        if (agent.status && agent.status !== 'active') return false;
        if (agent.source && agent.source !== 'registry') return false;
        return true;
      });
      if (activeAgents.length >= expected) {
        return;
      }
    } catch (_error) {
      lastError = _error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (lastError) {
    throw new Error(`Agents failed to register: ${lastError?.message || lastError}`);
  }
  throw new Error('Agents failed to register');
}

function trackProcessExit(child: ChildProcess, name: string): Promise<never> {
  return new Promise((_, reject) => {
    child.on('error', (error) => {
      reject(new Error(`${name} failed to start: ${error.message}`));
    });
    child.on('exit', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') {
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`${name} exited with code ${code}`));
      }
    });
  });
}

function terminateProcess(child: ChildProcess) {
  try {
    if (!child.pid) return;
    process.kill(-child.pid, 'SIGTERM');
  } catch (_error) {
    try {
      if (child.pid) process.kill(child.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
}

function forceKillProcess(child: ChildProcess) {
  try {
    if (!child.pid) return;
    process.kill(-child.pid, 'SIGKILL');
  } catch (_error) {
    try {
      if (child.pid) process.kill(child.pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}

async function resolveRepoRoot(startDir: string): Promise<string> {
  let current = startDir;
  while (true) {
    const workspaceFile = path.join(current, 'pnpm-workspace.yaml');
    try {
      await fs.access(workspaceFile);
      return current;
    } catch {
      // continue
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

async function safeRemoveDemoDir(demoDir: string, rootDir: string) {
  const resolvedDemo = path.resolve(demoDir);
  const resolvedRoot = path.resolve(rootDir);
  const demosRoot = path.join(resolvedRoot, 'demos');

  if (resolvedDemo === resolvedRoot || resolvedDemo === demosRoot) {
    throw new Error(`Refusing to delete unsafe path: ${resolvedDemo}`);
  }
  if (!resolvedDemo.startsWith(demosRoot + path.sep)) {
    throw new Error(`Refusing to delete path outside demos directory: ${resolvedDemo}`);
  }

  try {
    const stat = await fs.stat(resolvedDemo);
    if (stat.isDirectory()) {
      await fs.rm(resolvedDemo, { recursive: true, force: true });
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function updateStatus(
  status: Map<string, string>,
  details: Map<string, string>,
  event: ExecutionEvent
) {
  if (!event || !event.type) return;
  if (event.type === 'agent_started') {
    const name = event.data?.agentName || event.data?.agentId;
    if (name) {
      status.set(name, 'running');
      if (event.data?.task) {
        details.set(name, String(event.data.task));
      }
    }
  }
  if (event.type === 'agent_completed') {
    const name = event.data?.agentName || event.data?.agentId;
    if (name) status.set(name, 'completed');
  }
  if (event.type === 'agent_failed') {
    const name = event.data?.agentName || event.data?.agentId;
    if (name) status.set(name, 'failed');
  }
  if (event.type === 'completed') {
    status.set('orchestrator', 'completed');
  }
  if (event.type === 'failed') {
    status.set('orchestrator', 'failed');
  }
}

function renderStatus(
  status: Map<string, string>,
  details: Map<string, string>,
  event: ExecutionEvent
) {
  const lines: string[] = [];
  lines.push(chalk.bold('Swarm Status'));
  lines.push(chalk.gray('────────────────────────────────────'));
  for (const agent of AGENTS) {
    const state = status.get(agent.name) || 'idle';
    const badge = state === 'completed'
      ? chalk.green('●')
      : state === 'failed'
      ? chalk.red('●')
      : state === 'running'
      ? chalk.yellow('●')
      : chalk.gray('●');
    const detail = details.get(agent.name) || agent.summary;
    const stateLabel = state === 'completed'
      ? chalk.green('done')
      : state === 'failed'
      ? chalk.red('failed')
      : state === 'running'
      ? chalk.yellow('running')
      : chalk.gray('idle');
    lines.push(`${badge} ${agent.name.padEnd(18)} ${stateLabel} ${chalk.gray('·')} ${chalk.gray(detail)}`);
  }
  if (event?.type) {
    lines.push(chalk.gray('────────────────────────────────────'));
    lines.push(chalk.cyan(`event: ${event.type}`));
    if (event.type === 'progress' && event.data?.total) {
      lines.push(chalk.gray(`progress: ${event.data.completed}/${event.data.total}`));
    }
  }

  if (process.stdout.isTTY && process.env.TERM !== 'dumb') {
    process.stdout.write('\x1b[2J\x1b[0f' + lines.join('\n') + '\n');
    return;
  }
  process.stdout.write(lines.join('\n') + '\n');
}
