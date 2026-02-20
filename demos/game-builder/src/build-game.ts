#!/usr/bin/env tsx
/**
 * Game Builder Demo - CLI Entry Point
 *
 * This script demonstrates the full Parallax stack:
 * 1. Submits an org-chart pattern to the control plane
 * 2. Control plane provisions workspace (clones repo)
 * 3. Agent runtime spawns Claude agents for each role
 * 4. Agents collaborate to build a Pong game
 * 5. Workspace service creates PRs with the code
 *
 * Usage:
 *   pnpm build-game --repo owner/repo --token ghp_xxx
 *   pnpm build-game --repo owner/repo --token ghp_xxx --watch
 */

import { parseArgs } from 'node:util';

const CONTROL_PLANE_URL = process.env.PARALLAX_API_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 2000;

interface ExecutionResponse {
  id: string;
  status: string;
  message?: string;
  streamUrl?: string;
}

interface ExecutionResult {
  id: string;
  patternName: string;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  workspace?: {
    id: string;
    path: string;
    prUrl?: string;
    prNumber?: number;
  };
  metrics?: {
    durationMs: number;
    agentsUsed: number;
    stepsExecuted: number;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', short: 'r' },
      token: { type: 'string', short: 't' },
      watch: { type: 'boolean', short: 'w', default: false },
      game: { type: 'string', short: 'g', default: 'pong' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (!values.repo) {
    console.error('Error: --repo is required (e.g., --repo owner/my-game-repo)');
    process.exit(1);
  }

  if (!values.token) {
    console.error('Error: --token is required (GitHub PAT with repo access)');
    console.error('       Create one at: https://github.com/settings/tokens');
    process.exit(1);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    PARALLAX GAME BUILDER                      ║
║                                                               ║
║  Building: ${values.game.toUpperCase().padEnd(50)}║
║  Repo: ${values.repo.padEnd(54)}║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Check control plane health
  console.log('🔍 Checking control plane...');
  try {
    const healthRes = await fetch(`${CONTROL_PLANE_URL}/health`);
    if (!healthRes.ok) {
      throw new Error(`Health check failed: ${healthRes.status}`);
    }
    const health: any = await healthRes.json();
    console.log(`   ✓ Control plane healthy (${health.status})`);
  } catch (error) {
    console.error(`   ✗ Control plane not reachable at ${CONTROL_PLANE_URL}`);
    console.error('   Run: pnpm start:infra && pnpm start:control-plane');
    process.exit(1);
  }

  // Step 2: Submit execution request
  console.log('\n🚀 Submitting game build request...');

  const executionRequest = {
    patternName: `${values.game}-builder`,
    input: {
      repo: values.repo,
      gameType: values.game,
      features: ['basic_gameplay', 'keyboard_controls', 'scoring', 'win_condition'],
    },
    options: {
      stream: true,
      credentials: {
        type: 'pat',
        token: values.token,
      },
    },
  };

  let execution: ExecutionResponse;
  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(executionRequest),
    });

    if (!res.ok) {
      const error: any = await res.json();
      throw new Error(error.error || `Request failed: ${res.status}`);
    }

    execution = await res.json() as ExecutionResponse;
    console.log(`   ✓ Execution started: ${execution.id}`);
  } catch (error) {
    console.error(`   ✗ Failed to start execution: ${error}`);
    process.exit(1);
  }

  // Step 3: Stream or poll for updates
  console.log('\n📊 Execution Progress:');
  console.log('─'.repeat(60));

  if (values.watch && execution.streamUrl) {
    await streamExecution(execution.id, execution.streamUrl);
  } else {
    await pollExecution(execution.id);
  }
}

async function pollExecution(executionId: string): Promise<void> {
  let lastStatus = '';
  let lastEventCount = 0;

  while (true) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);
      if (!res.ok) {
        console.error(`Failed to fetch execution: ${res.status}`);
        break;
      }

      const result = await res.json() as ExecutionResult;

      // Print status changes
      if (result.status !== lastStatus) {
        lastStatus = result.status;
        const icon = result.status === 'completed' ? '✓' : result.status === 'failed' ? '✗' : '⋯';
        console.log(`\n   ${icon} Status: ${result.status}`);
      }

      // Fetch and print new events
      const eventsRes = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}/events`);
      if (eventsRes.ok) {
        const { events }: any = await eventsRes.json();
        if (events.length > lastEventCount) {
          for (const event of events.slice(lastEventCount)) {
            printEvent(event);
          }
          lastEventCount = events.length;
        }
      }

      // Check if done
      if (result.status === 'completed' || result.status === 'failed') {
        printFinalResult(result);
        break;
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error(`   Error polling: ${error}`);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function streamExecution(executionId: string, streamUrl: string): Promise<void> {
  // Use EventSource for SSE streaming
  console.log(`   Streaming from: ${streamUrl}`);

  // For now, fall back to polling since we're in Node.js
  // TODO: Use WebSocket or SSE client
  await pollExecution(executionId);
}

function printEvent(event: any): void {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const type = event.type;

  switch (type) {
    case 'started':
      console.log(`   [${time}] 🎬 Execution started: ${event.data?.patternName}`);
      break;
    case 'workspace_provisioning':
      console.log(`   [${time}] 📁 Provisioning workspace for ${event.data?.repo}...`);
      break;
    case 'workspace_ready':
      console.log(`   [${time}] 📁 Workspace ready: ${event.data?.branch}`);
      break;
    case 'agents_selected':
      console.log(`   [${time}] 🤖 Selected ${event.data?.count} agents`);
      break;
    case 'agent_started':
      console.log(`   [${time}] 🤖 Agent started: ${event.data?.agentName} (${event.data?.agentId?.slice(0, 8)})`);
      break;
    case 'agent_completed':
      const conf = event.data?.confidence ? ` (${(event.data.confidence * 100).toFixed(0)}% confidence)` : '';
      console.log(`   [${time}] ✓ Agent completed: ${event.data?.agentName}${conf}`);
      break;
    case 'agent_failed':
      console.log(`   [${time}] ✗ Agent failed: ${event.data?.agentName} - ${event.data?.error}`);
      break;
    case 'runtime_started':
      console.log(`   [${time}] ⚡ Executing pattern: ${event.data?.patternName}`);
      break;
    case 'runtime_completed':
      console.log(`   [${time}] ⚡ Pattern execution complete`);
      break;
    case 'workspace_pr_created':
      console.log(`   [${time}] 🔗 PR created: ${event.data?.prUrl}`);
      break;
    case 'completed':
      console.log(`   [${time}] 🎉 Execution completed!`);
      break;
    case 'failed':
      console.log(`   [${time}] 💥 Execution failed: ${event.data?.error}`);
      break;
    default:
      if (event.data) {
        console.log(`   [${time}] ${type}: ${JSON.stringify(event.data).slice(0, 60)}`);
      }
  }
}

function printFinalResult(result: ExecutionResult): void {
  console.log('\n' + '═'.repeat(60));

  if (result.status === 'completed') {
    console.log('\n🎉 GAME BUILD COMPLETE!\n');

    if (result.workspace?.prUrl) {
      console.log(`   📦 Pull Request: ${result.workspace.prUrl}`);
    }

    if (result.metrics) {
      console.log(`   ⏱  Duration: ${(result.metrics.durationMs / 1000).toFixed(1)}s`);
      console.log(`   🤖 Agents used: ${result.metrics.agentsUsed}`);
      console.log(`   📝 Steps executed: ${result.metrics.stepsExecuted}`);
    }

    console.log('\n   Next steps:');
    console.log('   1. Review the PR on GitHub');
    console.log('   2. Merge to deploy the game');
    console.log('   3. Open index.html to play!');
  } else {
    console.log('\n💥 BUILD FAILED\n');
    console.log(`   Error: ${result.error || 'Unknown error'}`);
    console.log('\n   Check the logs for details:');
    console.log(`   - Control plane logs`);
    console.log(`   - Jaeger traces: http://localhost:16686`);
  }

  console.log('\n' + '═'.repeat(60));
}

function printUsage(): void {
  console.log(`
Parallax Game Builder Demo

Usage:
  pnpm build-game --repo <owner/repo> --token <github_pat> [options]

Options:
  -r, --repo <owner/repo>   GitHub repository to build the game in (required)
  -t, --token <pat>         GitHub Personal Access Token (required)
  -g, --game <type>         Game type to build (default: pong)
  -w, --watch               Stream execution events in real-time
  -h, --help                Show this help message

Examples:
  # Build a Pong game
  pnpm build-game --repo myorg/my-pong --token ghp_xxx

  # Build with live streaming
  pnpm build-game --repo myorg/my-pong --token ghp_xxx --watch

Prerequisites:
  1. Start infrastructure: pnpm start:infra
  2. Start control plane: pnpm start:control-plane
  3. (Optional) Start dashboard: pnpm start:dashboard
  4. Create a GitHub repo for the game
  5. Create a PAT with 'repo' scope

View progress:
  - Dashboard: http://localhost:3000
  - Jaeger: http://localhost:16686
  - Grafana: http://localhost:3001
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
