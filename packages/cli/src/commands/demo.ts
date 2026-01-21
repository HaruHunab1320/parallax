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
  .option('--scenario <name>', 'Scenario to run: launch-readiness | micro-app | api-spec | all', 'all')
  .option('--llm <provider>', 'LLM provider for agents (gemini|stub)', process.env.PARALLAX_LLM_PROVIDER || 'stub')
  .option('--llm-model <model>', 'LLM model name', process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview')
  .option('--persist-agents', 'Keep agents registered after the demo completes')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(goldenTicketHandler);

async function goldenTicketHandler(options: any) {
    const scenarioLabel = options?.scenario && options.scenario !== 'all'
      ? `${options.scenario}`
      : (options?.name || 'golden-ticket');
    const spinner = ora(`Preparing ${scenarioLabel} demo...`).start();
    const processes: ChildProcess[] = [];
    const exitSignals: Promise<never>[] = [];
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentProcesses: ChildProcess[] = [];
    const persistAgents = Boolean(options.persistAgents);
    const llmProvider = options.llm || process.env.PARALLAX_LLM_PROVIDER || 'stub';
    const llmModel = options.llmModel || process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview';

    const rootDir = await resolveRepoRoot(path.resolve(options.dir));
    const demoDir = path.join(rootDir, 'demos', options.name);
    const patternsDir = path.join(demoDir, 'patterns');
    const agentsDir = path.join(demoDir, 'agents');
    const appDir = path.join(demoDir, 'app');
    const artifactsDir = path.join(demoDir, 'artifacts');
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
        if (!persistAgents) {
          agentProcesses.forEach(p => terminateProcess(p));
        }
        processes.forEach(p => terminateProcess(p));
        setTimeout(() => {
          if (!persistAgents) {
            agentProcesses.forEach(p => forceKillProcess(p));
          }
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
      await fs.mkdir(artifactsDir, { recursive: true });

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
          PARALLAX_RUN_ID: runId,
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
        detached: false
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
            PARALLAX_RUN_ID: runId,
            PARALLAX_REGISTRY: `localhost:${grpcPort}`,
            PARALLAX_MTLS_ENABLED: useMtls ? 'true' : 'false',
            PARALLAX_MTLS_CERTS: certsDir,
            PARALLAX_AGENT_HOST: '127.0.0.1',
            PARALLAX_PERSIST_AGENTS: persistAgents ? 'true' : 'false',
            PARALLAX_LLM_PROVIDER: llmProvider,
            PARALLAX_LLM_MODEL: llmModel,
            PARALLAX_SDK_PATH: path.join(rootDir, 'packages', 'sdk-typescript', 'dist', 'src', 'index.js'),
            PARALLAX_PROTO_DIR: path.join(rootDir, 'proto')
          },
          stdio: 'inherit',
          detached: false
          }
        );
        processes.push(child);
        agentProcesses.push(child);
        exitSignals.push(trackProcessExit(child, `Agent ${agent.name}`));
      }

      const client = new ParallaxHttpClient({ baseURL: `http://localhost:${httpPort}` });
      await Promise.race([
        waitForAgents(client, AGENTS.length, runId),
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
        status.clear();
        details.clear();
        AGENTS.forEach(agent => {
          status.set(agent.name, 'idle');
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

      const selectedScenario = String(options.scenario || 'all');
      const runLaunchReadiness = async () => runPattern('SwarmOrchestrator', {
        task: 'Launch readiness gate: produce plan, QA checklist, and runbook',
        data: { projectDir: appDir, artifactsDir, scenario: 'launch-readiness' }
      });
      const runMicroApp = async () => runPattern('SwarmShardMapReduce', {
        task: 'Micro-app scaffold: update UI and gameplay loop',
        data: { projectDir: appDir, artifactsDir, scenario: 'micro-app' }
      });
      const runApiSpec = async () => runPattern('SwarmReviewConsensus', {
        task: 'API spec + client: draft OpenAPI and client helper',
        data: { projectDir: appDir, artifactsDir, scenario: 'api-spec' }
      });
      const runResearch = async () => runPattern('SwarmTestLoop', {
        task: 'Research swarm: explore branches and capture open questions',
        data: { projectDir: appDir, artifactsDir, scenario: 'research' }
      });

      if (selectedScenario === 'all') {
        await runLaunchReadiness();
        await runMicroApp();
        await runApiSpec();
        await runResearch();
      } else if (selectedScenario === 'launch-readiness') {
        await runLaunchReadiness();
      } else if (selectedScenario === 'micro-app') {
        await runMicroApp();
      } else if (selectedScenario === 'api-spec') {
        await runApiSpec();
      } else if (selectedScenario === 'research') {
        await runResearch();
      } else {
        throw new Error(`Unknown scenario: ${selectedScenario}`);
      }

      if (selectedScenario === 'micro-app' || selectedScenario === 'all') {
        console.log(chalk.green('\n✅ Swarm run complete. Launching demo app...\n'));
        const appProcess = spawn('pnpm', ['dev'], {
          cwd: appDir,
          stdio: 'inherit',
          env: { ...process.env },
          detached: false
        });
        processes.push(appProcess);

        console.log(chalk.gray(`App directory: ${appDir}`));
        console.log(chalk.gray(`Open: http://localhost:5173`));
        console.log(chalk.yellow('\nPress Ctrl+C to stop the demo.\n'));
      } else {
        console.log(chalk.green('\n✅ Swarm run complete.\n'));
        console.log(chalk.gray(`Artifacts directory: ${path.join(artifactsDir, selectedScenario)}`));
      }

      if (!persistAgents) {
        agentProcesses.forEach(p => terminateProcess(p));
        setTimeout(() => {
          agentProcesses.forEach(p => forceKillProcess(p));
        }, 1500);
      }
    } catch (error: any) {
      spinner.fail(chalk.red('Golden ticket demo failed'));
      console.error(error?.message || error);
      processes.forEach(p => terminateProcess(p));
      setTimeout(() => {
        processes.forEach(p => forceKillProcess(p));
        process.exit(1);
      }, 3000);
    }
}

function withScenarioDefaults(options: any, scenario: string, name: string) {
  return {
    ...options,
    scenario,
    name: options.name || name
  };
}

demoCommand
  .command('launch-readiness')
  .description('Run the launch readiness demo')
  .option('--dir <path>', 'Root directory to create demo under', process.cwd())
  .option('--name <name>', 'Demo folder name', 'launch-readiness')
  .option('--port <port>', 'Control plane HTTP port', '3000')
  .option('--grpc-port <port>', 'Control plane gRPC port', '50051')
  .option('--db-port <port>', 'Postgres port', process.env.PARALLAX_DB_PORT || '5433')
  .option('--clean', 'Delete existing demo directory before generating')
  .option('--skip-sdk-build', 'Skip building the TypeScript SDK before starting agents')
  .option('--llm <provider>', 'LLM provider for agents (gemini|stub)', process.env.PARALLAX_LLM_PROVIDER || 'stub')
  .option('--llm-model <model>', 'LLM model name', process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview')
  .option('--persist-agents', 'Keep agents registered after the demo completes')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(async (options) => goldenTicketHandler(withScenarioDefaults(options, 'launch-readiness', 'launch-readiness')));

demoCommand
  .command('micro-app')
  .description('Run the micro-app scaffold demo')
  .option('--dir <path>', 'Root directory to create demo under', process.cwd())
  .option('--name <name>', 'Demo folder name', 'micro-app')
  .option('--port <port>', 'Control plane HTTP port', '3000')
  .option('--grpc-port <port>', 'Control plane gRPC port', '50051')
  .option('--db-port <port>', 'Postgres port', process.env.PARALLAX_DB_PORT || '5433')
  .option('--clean', 'Delete existing demo directory before generating')
  .option('--skip-sdk-build', 'Skip building the TypeScript SDK before starting agents')
  .option('--llm <provider>', 'LLM provider for agents (gemini|stub)', process.env.PARALLAX_LLM_PROVIDER || 'stub')
  .option('--llm-model <model>', 'LLM model name', process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview')
  .option('--persist-agents', 'Keep agents registered after the demo completes')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(async (options) => goldenTicketHandler(withScenarioDefaults(options, 'micro-app', 'micro-app')));

demoCommand
  .command('api-spec')
  .description('Run the API spec + client demo')
  .option('--dir <path>', 'Root directory to create demo under', process.cwd())
  .option('--name <name>', 'Demo folder name', 'api-spec')
  .option('--port <port>', 'Control plane HTTP port', '3000')
  .option('--grpc-port <port>', 'Control plane gRPC port', '50051')
  .option('--db-port <port>', 'Postgres port', process.env.PARALLAX_DB_PORT || '5433')
  .option('--clean', 'Delete existing demo directory before generating')
  .option('--skip-sdk-build', 'Skip building the TypeScript SDK before starting agents')
  .option('--llm <provider>', 'LLM provider for agents (gemini|stub)', process.env.PARALLAX_LLM_PROVIDER || 'stub')
  .option('--llm-model <model>', 'LLM model name', process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview')
  .option('--persist-agents', 'Keep agents registered after the demo completes')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(async (options) => goldenTicketHandler(withScenarioDefaults(options, 'api-spec', 'api-spec')));

demoCommand
  .command('research')
  .description('Run the research swarm demo')
  .option('--dir <path>', 'Root directory to create demo under', process.cwd())
  .option('--name <name>', 'Demo folder name', 'research-swarm')
  .option('--port <port>', 'Control plane HTTP port', '3000')
  .option('--grpc-port <port>', 'Control plane gRPC port', '50051')
  .option('--db-port <port>', 'Postgres port', process.env.PARALLAX_DB_PORT || '5433')
  .option('--clean', 'Delete existing demo directory before generating')
  .option('--skip-sdk-build', 'Skip building the TypeScript SDK before starting agents')
  .option('--llm <provider>', 'LLM provider for agents (gemini|stub)', process.env.PARALLAX_LLM_PROVIDER || 'stub')
  .option('--llm-model <model>', 'LLM model name', process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview')
  .option('--persist-agents', 'Keep agents registered after the demo completes')
  .option('--no-mtls', 'Disable mTLS for agent gRPC')
  .action(async (options) => goldenTicketHandler(withScenarioDefaults(options, 'research', 'research-swarm')));

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
import fs from 'fs/promises';

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

function getScenarioContext(data: any) {
  const demoRoot = path.resolve(__dirname, '..');
  const projectDir = data?.projectDir || path.join(demoRoot, 'app');
  const artifactsDir = data?.artifactsDir || path.join(demoRoot, 'artifacts');
  const scenario = data?.scenario || 'default';
  const scenarioDir = path.join(artifactsDir, scenario);
  return { scenario, projectDir, artifactsDir, scenarioDir };
}

async function writeFileSafe(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeScenarioFile(ctx: any, relativePath: string, content: string) {
  return writeFileSafe(path.join(ctx.scenarioDir, relativePath), content);
}

async function writeProjectFile(ctx: any, relativePath: string, content: string) {
  return writeFileSafe(path.join(ctx.projectDir, relativePath), content);
}

async function writeLlmFiles(ctx: any, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    if (ctx.scenario === 'micro-app') {
      await writeProjectFile(ctx, relativePath, content);
    } else {
      await writeScenarioFile(ctx, relativePath, content);
    }
  }
}

async function maybeGenerateWithLlm(agentId: string, task: string, data: any) {
  if (process.env.PARALLAX_LLM_PROVIDER !== 'gemini') return null;
  try {
    const patternSdkPath = process.env.PARALLAX_PATTERN_SDK_PATH;
    const patternSdk = patternSdkPath
      ? await import(pathToFileURL(patternSdkPath).href)
      : await import('@parallax/pattern-sdk');
    const { createGeminiProvider } = patternSdk as any;
    const { z } = await import('zod');
    const model = process.env.PARALLAX_LLM_MODEL || 'gemini-3-pro-preview';
    const provider = createGeminiProvider(process.env.GEMINI_API_KEY, model);
    const schema = z.object({
      summary: z.string().optional(),
      notes: z.string().optional(),
      files: z.record(z.string()).optional()
    });

    const scenario = data?.scenario || 'default';
    const system = 'You are a Parallax agent. Return strictly valid JSON that matches the schema.';
    let prompt = 'Task: ' + task + '\\nRole: ' + agentId + '\\nScenario: ' + scenario + '\\n';
    if (scenario === 'launch-readiness') {
      prompt += 'Produce files: architecture.md, plan.md, ui-checklist.md, gameplay-notes.md, ux-notes.md, test-plan.md, runbook.md.\\n';
      prompt += 'Runbook should reference the project directory: ' + (data?.projectDir || '') + '\\n';
    } else if (scenario === 'micro-app') {
      prompt += 'Produce files in the app: public/index.html, public/styles.css, public/app.js, README.md.\\n';
    } else if (scenario === 'api-spec') {
      prompt += 'Produce files: openapi.yaml, client.js, example-request.json, plan.md, test-plan.md, deploy.md, docs.md.\\n';
    } else if (scenario === 'research') {
      prompt += 'Produce files: lead-brief.md, research-plan.md, technical-scan.md, adjacent-ideas.md, stakeholder-notes.md, open-questions.md, sources-plan.md.\\n';
    }

    const result = await provider.generateObject({ schema, prompt, system });
    return result.object;
  } catch (error) {
    console.error('LLM generation failed', error);
    return null;
  }
}

async function handleScenario(agentId: string, task: string, data: any) {
  const ctx = getScenarioContext(data || {});
  if (process.env.PARALLAX_AGENT_DEBUG === '1') {
    const keys = data && typeof data === 'object' ? Object.keys(data) : [];
    console.log('[agent-debug] ' + agentId + ' task="' + task + '" scenario="' + ctx.scenario + '" artifactsDir="' + ctx.artifactsDir + '" scenarioDir="' + ctx.scenarioDir + '" dataKeys=' + JSON.stringify(keys));
  }
  if (ctx.scenario === 'launch-readiness') {
    switch (agentId) {
      case 'architect':
        await writeScenarioFile(ctx, 'architecture.md', '# Launch Readiness Architecture\\n\\nStack: vanilla JS + Canvas + Node HTTP\\n');
        return { value: { summary: 'Documented launch readiness architecture' }, confidence: 0.86, reasoning: 'Captured stack and scope' };
      case 'lead-dev':
        await writeScenarioFile(ctx, 'plan.md', '# Launch Readiness Plan\\n\\n1. Validate UI + gameplay\\n2. Run QA checklist\\n3. Publish demo notes\\n');
        return { value: { summary: 'Launch plan drafted' }, confidence: 0.85, reasoning: 'Outlined readiness steps' };
      case 'engineer-1':
        await writeScenarioFile(ctx, 'ui-checklist.md', '# UI Checklist\\n\\n- HUD readable\\n- Canvas centered\\n- Controls visible\\n');
        return { value: { summary: 'UI checklist captured' }, confidence: 0.8, reasoning: 'UI readiness notes' };
      case 'engineer-2':
        await writeScenarioFile(ctx, 'gameplay-notes.md', '# Gameplay Notes\\n\\n- 2D movement\\n- Dash on spacebar\\n');
        return { value: { summary: 'Gameplay notes documented' }, confidence: 0.8, reasoning: 'Gameplay scope defined' };
      case 'designer':
        await writeScenarioFile(ctx, 'ux-notes.md', '# UX Notes\\n\\n- High contrast HUD\\n- Minimal copy\\n');
        return { value: { notes: 'Prepared UX notes' }, confidence: 0.8, reasoning: 'UX guidance captured' };
      case 'qa':
        await writeScenarioFile(ctx, 'test-plan.md', '# QA Plan\\n\\n- Render check\\n- Movement check\\n- Dash check\\n');
        return { value: { passed: true, tests: ['render', 'movement', 'dash'] }, confidence: 0.8, reasoning: 'QA plan drafted' };
      case 'devops':
        await writeScenarioFile(ctx, 'runbook.md', '# Runbook\\n\\n- cd ' + ctx.projectDir + '\\n- pnpm dev\\n- open http://localhost:5173\\n');
        return { value: { notes: 'Runbook ready' }, confidence: 0.82, reasoning: 'Launch steps documented' };
      default:
        return null;
    }
  }

  if (ctx.scenario === 'micro-app') {
    switch (agentId) {
      case 'engineer-1':
        await writeProjectFile(ctx, 'public/index.html', '<!doctype html>\\n<html>\\n  <head>\\n    <meta charset=\"utf-8\" />\\n    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />\\n    <title>Doom-lite Micro App</title>\\n    <link rel=\"stylesheet\" href=\"./styles.css\" />\\n  </head>\\n  <body>\\n    <div class=\"hud\"><strong>Doom-lite</strong><br/>WASD to move · Space to dash</div>\\n    <canvas id=\"game\" width=\"960\" height=\"540\"></canvas>\\n    <script src=\"./app.js\"></script>\\n  </body>\\n</html>\\n');
        return { value: { summary: 'Updated index.html for micro-app' }, confidence: 0.84, reasoning: 'Wired styles and HUD copy' };
      case 'designer':
        await writeProjectFile(ctx, 'public/styles.css', 'body { margin: 0; background: #0b0f14; color: #e8eef7; font-family: \"Space Grotesk\", \"Segoe UI\", sans-serif; }\\n.hud { position: fixed; top: 16px; left: 16px; padding: 10px 14px; border-radius: 10px; background: rgba(10,12,18,0.8); border: 1px solid rgba(255,255,255,0.08); }\\ncanvas { display: block; margin: 0 auto; background: #05070a; border: 1px solid rgba(255,255,255,0.06); }\\n');
        return { value: { notes: 'Wrote styles.css for micro-app' }, confidence: 0.82, reasoning: 'Styled HUD + canvas' };
      case 'engineer-2':
        await writeProjectFile(ctx, 'public/app.js', 'const canvas = document.getElementById(\"game\");\\nconst ctx2d = canvas.getContext(\"2d\");\\nconst state = { player: { x: 140, y: 120, size: 18, speed: 3, dash: 6, dashFrames: 0 }, keys: new Set(), orbs: [{x:220,y:140,r:6},{x:520,y:320,r:6},{x:720,y:180,r:6}] };\\nwindow.addEventListener(\"keydown\", e => state.keys.add(e.key.toLowerCase()));\\nwindow.addEventListener(\"keyup\", e => state.keys.delete(e.key.toLowerCase()));\\nfunction movePlayer(){ let dx=0, dy=0; const speed = state.player.dashFrames>0 ? state.player.dash : state.player.speed; if(state.keys.has(\"w\")) dy-=speed; if(state.keys.has(\"s\")) dy+=speed; if(state.keys.has(\"a\")) dx-=speed; if(state.keys.has(\"d\")) dx+=speed; if(state.keys.has(\" \") && state.player.dashFrames===0) state.player.dashFrames=8; if(state.player.dashFrames>0) state.player.dashFrames-=1; state.player.x = Math.max(0, Math.min(canvas.width - state.player.size, state.player.x + dx)); state.player.y = Math.max(0, Math.min(canvas.height - state.player.size, state.player.y + dy)); }\\nfunction draw(){ ctx2d.fillStyle=\"#0b0f14\"; ctx2d.fillRect(0,0,canvas.width,canvas.height); ctx2d.fillStyle=\"#253048\"; state.orbs.forEach(o => { ctx2d.beginPath(); ctx2d.arc(o.x,o.y,o.r,0,Math.PI*2); ctx2d.fill(); }); ctx2d.fillStyle=\"#ff3355\"; ctx2d.fillRect(state.player.x,state.player.y,state.player.size,state.player.size); }\\nfunction loop(){ movePlayer(); draw(); requestAnimationFrame(loop);}\\nloop();\\n');
        return { value: { summary: 'Updated gameplay loop' }, confidence: 0.84, reasoning: 'Added dash + orbs' };
      case 'lead-dev':
        await writeProjectFile(ctx, 'README.md', '# Doom-lite Micro App\\n\\nRun locally:\\n\\npnpm dev\\n\\nControls:\\n- WASD to move\\n- Space to dash\\n');
        return { value: { summary: 'Wrote app README' }, confidence: 0.83, reasoning: 'Documented run steps' };
      case 'qa':
        await writeScenarioFile(ctx, 'qa.md', '# Micro-app QA Notes\\n\\n- Visuals render\\n- Controls responsive\\n- HUD visible\\n');
        return { value: { passed: true }, confidence: 0.82, reasoning: 'QA notes captured' };
      case 'devops':
        await writeScenarioFile(ctx, 'runbook.md', '# Micro-app Runbook\\n\\n- pnpm dev\\n- open http://localhost:5173\\n');
        return { value: { notes: 'Micro-app runbook saved' }, confidence: 0.8, reasoning: 'Ops steps noted' };
      case 'architect':
        await writeScenarioFile(ctx, 'architecture.md', '# Micro-app Architecture\\n\\n- Single-page app in /public\\n- Canvas loop in app.js\\n');
        return { value: { summary: 'Outlined micro-app architecture' }, confidence: 0.84, reasoning: 'Minimal footprint documented' };
      default:
        return null;
    }
  }

  if (ctx.scenario === 'api-spec') {
    switch (agentId) {
      case 'architect':
        await writeScenarioFile(ctx, 'openapi.yaml', 'openapi: 3.0.3\\ninfo:\\n  title: Parallax Demo API\\n  version: 0.1.0\\npaths:\\n  /status:\\n    get:\\n      summary: Health check\\n      responses:\\n        \"200\":\\n          description: OK\\n  /sessions:\\n    post:\\n      summary: Create demo session\\n      requestBody:\\n        required: true\\n        content:\\n          application/json:\\n            schema:\\n              type: object\\n              properties:\\n                name:\\n                  type: string\\n      responses:\\n        \"201\":\\n          description: Created\\n');
        return { value: { summary: 'Drafted OpenAPI spec' }, confidence: 0.82, reasoning: 'Defined minimal endpoints' };
      case 'engineer-1':
        await writeScenarioFile(ctx, 'client.js', 'export async function createSession(name){\\n  const res = await fetch(\"/sessions\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ name }) });\\n  if (!res.ok) throw new Error(\"Failed to create session\");\\n  return res.json();\\n}\\n\\nexport async function fetchStatus(){\\n  const res = await fetch(\"/status\");\\n  if (!res.ok) throw new Error(\"Status check failed\");\\n  return res.text();\\n}\\n');
        return { value: { summary: 'Drafted API client' }, confidence: 0.78, reasoning: 'Provided fetch wrappers' };
      case 'engineer-2':
        await writeScenarioFile(ctx, 'example-request.json', '{\\n  \"name\": \"demo-session\"\\n}\\n');
        return { value: { summary: 'Added API example payload' }, confidence: 0.76, reasoning: 'Provided sample request' };
      case 'lead-dev':
        await writeScenarioFile(ctx, 'plan.md', '# API Implementation Plan\\n\\n- Implement /status GET\\n- Implement /sessions POST\\n- Add in-memory storage\\n');
        return { value: { summary: 'API plan drafted' }, confidence: 0.8, reasoning: 'Outlined minimal steps' };
      case 'qa':
        await writeScenarioFile(ctx, 'test-plan.md', '# API Test Plan\\n\\n- GET /status returns 200\\n- POST /sessions returns 201\\n');
        return { value: { passed: true }, confidence: 0.78, reasoning: 'API test plan captured' };
      case 'devops':
        await writeScenarioFile(ctx, 'deploy.md', '# API Deploy Notes\\n\\n- Deploy behind reverse proxy\\n- Rate limit /sessions\\n');
        return { value: { notes: 'API deploy notes written' }, confidence: 0.76, reasoning: 'Deployment considerations noted' };
      case 'designer':
        await writeScenarioFile(ctx, 'docs.md', '# API UX Notes\\n\\n- Keep endpoint names short\\n- Provide curl examples\\n');
        return { value: { notes: 'API UX notes drafted' }, confidence: 0.78, reasoning: 'Clarity guidance' };
      default:
        return null;
    }
  }

  if (ctx.scenario === 'research') {
    switch (agentId) {
      case 'architect':
        await writeScenarioFile(ctx, 'lead-brief.md', '# Research Lead Brief\\n\\n- Define scope and objectives\\n- Identify key questions\\n- Track uncertainties\\n');
        return { value: { summary: 'Research scope defined' }, confidence: 0.82, reasoning: 'Framed objectives and key questions' };
      case 'lead-dev':
        await writeScenarioFile(ctx, 'research-plan.md', '# Research Plan\\n\\n1. Background scan\\n2. Market/competitive landscape\\n3. Risks and mitigations\\n4. Synthesis and open questions\\n');
        return { value: { summary: 'Research plan drafted' }, confidence: 0.84, reasoning: 'Outlined staged approach' };
      case 'engineer-1':
        await writeScenarioFile(ctx, 'technical-scan.md', '# Technical Scan\\n\\n- Existing tooling capabilities\\n- Integration constraints\\n- Key implementation risks\\n');
        return { value: { summary: 'Technical scan documented' }, confidence: 0.8, reasoning: 'Captured technical considerations' };
      case 'engineer-2':
        await writeScenarioFile(ctx, 'adjacent-ideas.md', '# Adjacent Ideas\\n\\n- Alternative approaches\\n- Cross-domain inspirations\\n- Future extensions\\n');
        return { value: { summary: 'Adjacent ideas captured' }, confidence: 0.78, reasoning: 'Explored tangents' };
      case 'designer':
        await writeScenarioFile(ctx, 'stakeholder-notes.md', '# Stakeholder Notes\\n\\n- Who benefits\\n- What success looks like\\n- Narrative for demo\\n');
        return { value: { notes: 'Stakeholder narrative drafted' }, confidence: 0.79, reasoning: 'Focused on messaging and clarity' };
      case 'qa':
        await writeScenarioFile(ctx, 'open-questions.md', '# Open Questions\\n\\n- What data is missing?\\n- Which assumptions are unverified?\\n- What could invalidate the thesis?\\n');
        return { value: { summary: 'Open questions listed' }, confidence: 0.77, reasoning: 'Highlighted unknowns' };
      case 'devops':
        await writeScenarioFile(ctx, 'sources-plan.md', '# Sources Plan\\n\\n- Identify primary sources\\n- Track citations\\n- Verify key claims\\n');
        return { value: { notes: 'Sources plan drafted' }, confidence: 0.78, reasoning: 'Outlined evidence collection' };
      default:
        return null;
    }
  }

  return null;
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
        { role: '${agent.id}', summary: '${agent.summary}', labels: { runId: process.env.PARALLAX_RUN_ID || '' } },
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
      const llmResult = await maybeGenerateWithLlm('${agent.id}', task, data || {});
      if (llmResult && llmResult.files && Object.keys(llmResult.files).length > 0) {
        const ctx = getScenarioContext(data || {});
        await writeLlmFiles(ctx, llmResult.files);
        return {
          value: { summary: llmResult.summary || 'LLM output written', notes: llmResult.notes || '' },
          confidence: 0.72,
          reasoning: 'Generated artifacts via LLM'
        };
      }
      const scenarioResult = await handleScenario('${agent.id}', task, data || {});
      if (scenarioResult) {
        return {
          value: scenarioResult.value,
          confidence: scenarioResult.confidence || 0.8,
          reasoning: scenarioResult.reasoning || 'Scenario result'
        };
      }
      const payload = buildResponse(task, data || {});
      return {
        value: payload,
        confidence: payload.confidence || 0.8,
        reasoning: payload.reasoning || 'Agent response'
      };
    }
  }

  const agent = new ${camel(agent.id)}Agent();
  const persistAgents = process.env.PARALLAX_PERSIST_AGENTS === 'true';
  const shutdown = async () => {
    if (persistAgents) return;
    try {
      await agent.shutdown();
    } catch (error) {
      console.error('Agent shutdown failed', error);
    }
  };
  process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
  process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));
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

async function waitForAgents(client: ParallaxHttpClient, expected: number, runId?: string, maxRetries = 30): Promise<void> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const agents = await client.listAgents();
      const activeAgents = agents.filter(agent => {
        if (agent.status && agent.status !== 'active') return false;
        if (agent.source && agent.source !== 'registry') return false;
        const agentRunId = agent.metadata?.labels?.runId || agent.metadata?.runId;
        if (runId && agentRunId !== runId) return false;
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
    child.kill('SIGTERM');
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
    child.kill('SIGKILL');
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

  if (event?.type) {
    const progress = event.type === 'progress' && event.data?.total
      ? ` ${event.data.completed}/${event.data.total}`
      : '';
    process.stdout.write(`event: ${event.type}${progress}\n`);
    return;
  }

  process.stdout.write(lines.join('\n') + '\n');
}
