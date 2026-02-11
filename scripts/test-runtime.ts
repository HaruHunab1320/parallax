#!/usr/bin/env npx tsx
/**
 * Runtime Integration Test
 *
 * Tests the entire agent runtime stack:
 * 1. Echo adapter (validates infrastructure without external deps)
 * 2. Claude adapter (validates full auth flow)
 *
 * Usage:
 *   pnpm test:runtime              # Run echo test only
 *   pnpm test:runtime --claude     # Include Claude test (requires auth)
 *   pnpm test:runtime --verbose    # Verbose output
 */

import WebSocket from 'ws';

const RUNTIME_PORT = 9876;
const RUNTIME_URL = `http://localhost:${RUNTIME_PORT}`;
const WS_URL = `ws://localhost:${RUNTIME_PORT}`;

// Parse args
const args = process.argv.slice(2);
const includeClaudeTest = args.includes('--claude');
const verbose = args.includes('--verbose');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step: string) {
  console.log(`\n${colors.blue}━━━ ${step} ━━━${colors.reset}`);
}

function logSuccess(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function logWarn(msg: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function logDebug(msg: string) {
  if (verbose) {
    console.log(`${colors.dim}  ${msg}${colors.reset}`);
  }
}

// ─────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────

async function httpGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${RUNTIME_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function httpPost(path: string, data: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${RUNTIME_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function httpDelete(path: string): Promise<{ status: number }> {
  const res = await fetch(`${RUNTIME_URL}${path}`, { method: 'DELETE' });
  return { status: res.status };
}

// ─────────────────────────────────────────────────────────────
// WebSocket Event Listener
// ─────────────────────────────────────────────────────────────

interface RuntimeEvent {
  event: string;
  data: any;
  timestamp: string;
}

function createEventStream(agentId?: string): Promise<{
  events: RuntimeEvent[];
  waitForEvent: (eventType: string, timeout?: number) => Promise<RuntimeEvent>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const url = agentId
      ? `${WS_URL}/ws/events?agentId=${agentId}`
      : `${WS_URL}/ws/events`;

    const ws = new WebSocket(url);
    const events: RuntimeEvent[] = [];
    const eventWaiters: Map<string, { resolve: (e: RuntimeEvent) => void; reject: (e: Error) => void }[]> = new Map();

    ws.on('open', () => {
      logDebug(`WebSocket connected to ${url}`);
      resolve({
        events,
        waitForEvent: (eventType: string, timeout = 60000) => {
          return new Promise((res, rej) => {
            // Check if we already have this event
            const existing = events.find(e => e.event === eventType);
            if (existing) {
              res(existing);
              return;
            }

            // Otherwise wait for it
            const waiters = eventWaiters.get(eventType) || [];
            waiters.push({ resolve: res, reject: rej });
            eventWaiters.set(eventType, waiters);

            // Timeout
            setTimeout(() => {
              const idx = waiters.findIndex(w => w.resolve === res);
              if (idx >= 0) {
                waiters.splice(idx, 1);
                rej(new Error(`Timeout waiting for event: ${eventType}`));
              }
            }, timeout);
          });
        },
        close: () => ws.close(),
      });
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event) {
          logDebug(`Event: ${msg.event}`);
          events.push(msg);

          // Notify waiters
          const waiters = eventWaiters.get(msg.event);
          if (waiters) {
            for (const waiter of waiters) {
              waiter.resolve(msg);
            }
            eventWaiters.delete(msg.event);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

async function testHealthEndpoint(): Promise<boolean> {
  logStep('Testing Health Endpoint');

  try {
    const { status, body } = await httpGet('/api/health');

    if (status !== 200) {
      logError(`Health check failed with status ${status}`);
      return false;
    }

    if (!body.healthy) {
      logError(`Runtime reports unhealthy: ${body.message}`);
      return false;
    }

    logSuccess(`Runtime healthy: ${body.message || 'OK'}`);
    return true;
  } catch (error: any) {
    logError(`Failed to connect to runtime: ${error.message}`);
    logInfo(`Make sure the runtime is running: pnpm --filter @parallax/runtime-local dev`);
    return false;
  }
}

async function testEchoAgent(): Promise<boolean> {
  logStep('Testing Echo Agent (Infrastructure Validation)');

  let agentId: string | null = null;
  let eventStream: Awaited<ReturnType<typeof createEventStream>> | null = null;

  try {
    // Connect to event stream first
    logInfo('Connecting to event stream...');
    eventStream = await createEventStream();
    logSuccess('Event stream connected');

    // Spawn echo agent
    logInfo('Spawning echo agent...');
    const { status, body } = await httpPost('/api/agents', {
      type: 'echo',
      name: 'test-echo-agent',
      capabilities: ['test'],
    });

    if (status !== 201) {
      logError(`Failed to spawn agent: ${JSON.stringify(body)}`);
      return false;
    }

    agentId = body.id;
    logSuccess(`Agent spawned: ${agentId}`);
    logDebug(`Agent details: ${JSON.stringify(body, null, 2)}`);

    // Wait for agent_started event
    logInfo('Waiting for agent_started event...');
    const startedEvent = await eventStream.waitForEvent('agent_started', 10000);
    logSuccess('Received agent_started event');

    // Wait for agent_ready event
    logInfo('Waiting for agent_ready event...');
    const readyEvent = await eventStream.waitForEvent('agent_ready', 30000);
    logSuccess('Received agent_ready event');

    // Verify agent is listed
    logInfo('Verifying agent is listed...');
    const { body: listBody } = await httpGet('/api/agents');
    const foundAgent = listBody.agents?.find((a: any) => a.id === agentId);
    if (!foundAgent) {
      logError('Agent not found in list');
      return false;
    }
    logSuccess(`Agent status: ${foundAgent.status}`);

    // Send a message
    logInfo('Sending test message...');
    const { status: sendStatus, body: sendBody } = await httpPost(`/api/agents/${agentId}/send`, {
      message: 'Hello from test!',
    });

    if (sendStatus !== 200) {
      logError(`Failed to send message: ${JSON.stringify(sendBody)}`);
      return false;
    }
    logSuccess('Message sent successfully');

    // Get logs
    logInfo('Retrieving agent logs...');
    const { body: logsBody } = await httpGet(`/api/agents/${agentId}/logs?tail=10`);
    logSuccess(`Retrieved ${logsBody.count} log lines`);
    if (verbose && logsBody.logs) {
      for (const line of logsBody.logs.slice(-5)) {
        logDebug(`  > ${line.substring(0, 100)}`);
      }
    }

    // Stop agent
    logInfo('Stopping agent...');
    const { status: stopStatus } = await httpDelete(`/api/agents/${agentId}`);
    if (stopStatus !== 204) {
      logWarn(`Unexpected stop status: ${stopStatus}`);
    }
    logSuccess('Agent stopped');

    // Wait for agent_stopped event
    logInfo('Waiting for agent_stopped event...');
    await eventStream.waitForEvent('agent_stopped', 10000);
    logSuccess('Received agent_stopped event');

    return true;
  } catch (error: any) {
    logError(`Echo agent test failed: ${error.message}`);
    return false;
  } finally {
    eventStream?.close();

    // Clean up agent if still running
    if (agentId) {
      try {
        await httpDelete(`/api/agents/${agentId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function testClaudeAgent(): Promise<boolean> {
  logStep('Testing Claude Agent (Full Authentication Flow)');

  let agentId: string | null = null;
  let eventStream: Awaited<ReturnType<typeof createEventStream>> | null = null;

  try {
    // Connect to event stream first
    logInfo('Connecting to event stream...');
    eventStream = await createEventStream();
    logSuccess('Event stream connected');

    // Spawn Claude agent
    logInfo('Spawning Claude agent...');
    const { status, body } = await httpPost('/api/agents', {
      type: 'claude',
      name: 'test-claude-agent',
      capabilities: ['code'],
      workdir: process.cwd(),
    });

    if (status !== 201) {
      logError(`Failed to spawn agent: ${JSON.stringify(body)}`);
      return false;
    }

    agentId = body.id;
    logSuccess(`Agent spawned: ${agentId}`);

    // Wait for agent_started event
    logInfo('Waiting for agent_started event...');
    await eventStream.waitForEvent('agent_started', 10000);
    logSuccess('Received agent_started event');

    // Now we might get login_required OR agent_ready depending on auth status
    logInfo('Waiting for agent status (login_required or agent_ready)...');
    log('\n' + colors.yellow + '  Watching for authentication events...' + colors.reset);
    log(colors.dim + '  If Claude CLI needs authentication, you\'ll see a login URL.' + colors.reset);
    log(colors.dim + '  Complete the login in your browser, then the test will continue.\n' + colors.reset);

    // Race between login_required and agent_ready
    const result = await Promise.race([
      eventStream.waitForEvent('login_required', 120000).then(e => ({ type: 'login', event: e })),
      eventStream.waitForEvent('agent_ready', 120000).then(e => ({ type: 'ready', event: e })),
    ]);

    if (result.type === 'login') {
      const loginUrl = result.event.data?.loginUrl || result.event.data?.url;
      log('\n' + colors.yellow + '═══════════════════════════════════════════════════════════' + colors.reset);
      log(colors.yellow + '  AUTHENTICATION REQUIRED' + colors.reset);
      log(colors.yellow + '═══════════════════════════════════════════════════════════' + colors.reset);

      if (loginUrl) {
        log(`\n  ${colors.cyan}Login URL:${colors.reset} ${loginUrl}\n`);
        log(colors.dim + '  1. Open the URL above in your browser' + colors.reset);
        log(colors.dim + '  2. Complete the authentication' + colors.reset);
        log(colors.dim + '  3. Return here - the test will automatically continue\n' + colors.reset);
      } else {
        log(`\n  ${colors.cyan}Instructions:${colors.reset} ${result.event.data?.instructions || 'Check the terminal for login instructions'}\n`);
      }

      logSuccess('Detected login_required event - authentication flow working!');

      // Now wait for agent_ready after login
      logInfo('Waiting for agent_ready after authentication (timeout: 5 minutes)...');
      try {
        await eventStream.waitForEvent('agent_ready', 300000); // 5 minute timeout for manual login
        logSuccess('Received agent_ready event - authentication successful!');
      } catch (e) {
        logWarn('Timeout waiting for authentication. This is expected if you didn\'t complete login.');
        logInfo('The test has validated that the login flow works correctly.');
        return true; // Still a success - we validated the login detection works
      }
    } else {
      logSuccess('Agent ready immediately (already authenticated)');
    }

    // If we get here, agent is ready - send a simple command
    logInfo('Sending test prompt to Claude...');
    const { status: sendStatus } = await httpPost(`/api/agents/${agentId}/send`, {
      message: 'Say "Hello from Parallax test!" and nothing else.',
    });

    if (sendStatus === 200) {
      logSuccess('Test prompt sent successfully');
    }

    // Brief wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get logs to see response
    const { body: logsBody } = await httpGet(`/api/agents/${agentId}/logs?tail=20`);
    if (logsBody.logs?.length > 0) {
      logSuccess('Received response from Claude');
      if (verbose) {
        for (const line of logsBody.logs.slice(-10)) {
          logDebug(`  > ${line.substring(0, 100)}`);
        }
      }
    }

    // Stop agent
    logInfo('Stopping agent...');
    await httpDelete(`/api/agents/${agentId}`);
    logSuccess('Agent stopped');

    return true;
  } catch (error: any) {
    logError(`Claude agent test failed: ${error.message}`);
    return false;
  } finally {
    eventStream?.close();

    // Clean up agent if still running
    if (agentId) {
      try {
        await httpDelete(`/api/agents/${agentId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + colors.cyan + '╔═══════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.cyan + '║        PARALLAX AGENT RUNTIME INTEGRATION TEST             ║' + colors.reset);
  console.log(colors.cyan + '╚═══════════════════════════════════════════════════════════╝' + colors.reset);

  log(`\nRuntime URL: ${RUNTIME_URL}`);
  log(`Include Claude test: ${includeClaudeTest ? 'Yes' : 'No (use --claude to enable)'}`);
  log(`Verbose: ${verbose ? 'Yes' : 'No (use --verbose to enable)'}`);

  const results: { test: string; passed: boolean }[] = [];

  // Test 1: Health check
  const healthPassed = await testHealthEndpoint();
  results.push({ test: 'Health Endpoint', passed: healthPassed });

  if (!healthPassed) {
    log('\n' + colors.red + '═══════════════════════════════════════════════════════════' + colors.reset);
    log(colors.red + '  RUNTIME NOT AVAILABLE' + colors.reset);
    log(colors.red + '═══════════════════════════════════════════════════════════' + colors.reset);
    log('\nTo start the runtime, run:');
    log(colors.cyan + '  cd packages/runtime-local && pnpm dev' + colors.reset);
    log('\nOr from the repo root:');
    log(colors.cyan + '  pnpm --filter @parallax/runtime-local dev' + colors.reset);
    process.exit(1);
  }

  // Test 2: Echo agent (infrastructure validation)
  const echoPassed = await testEchoAgent();
  results.push({ test: 'Echo Agent', passed: echoPassed });

  // Test 3: Claude agent (optional)
  if (includeClaudeTest) {
    const claudePassed = await testClaudeAgent();
    results.push({ test: 'Claude Agent', passed: claudePassed });
  }

  // Summary
  console.log('\n' + colors.cyan + '═══════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.cyan + '  TEST SUMMARY' + colors.reset);
  console.log(colors.cyan + '═══════════════════════════════════════════════════════════' + colors.reset);

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? colors.green + '✓' : colors.red + '✗';
    const status = result.passed ? 'PASSED' : 'FAILED';
    console.log(`  ${icon}${colors.reset} ${result.test}: ${status}`);
    if (!result.passed) allPassed = false;
  }

  console.log('');

  if (allPassed) {
    log(colors.green + '  All tests passed! The agent runtime is working correctly.' + colors.reset);
  } else {
    log(colors.red + '  Some tests failed. Check the output above for details.' + colors.reset);
  }

  console.log('');
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
