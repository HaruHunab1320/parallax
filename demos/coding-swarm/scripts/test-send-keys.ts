#!/usr/bin/env tsx

/**
 * Diagnostic: test tmux send-keys + Enter delivery
 *
 * Spawns a tmux session with a CLI agent and tests text delivery.
 * Run: npx tsx demos/coding-swarm/scripts/test-send-keys.ts
 */

import { createAdapter } from 'coding-agent-adapters';
import pino from 'pino';
import { TmuxManager } from 'tmux-manager';

const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } });
const agentType = process.argv[2] || 'claude';
const testMessage =
  process.argv[3] ||
  'Implement SimulationController. Create src/components/SimulationController.tsx with phases: DETECTION (5s), APPROACH (8s), CONTACT (12s), RESOLUTION (10s). Use useNervStore for state. Add start/pause/reset buttons. Style with NERV colors: bg #050505, text #FF3300, border #FF9900. Create src/__tests__/SimulationController.test.tsx with basic render tests. When done, commit your work.';

async function main() {
  const manager = new TmuxManager({
    sessionPrefix: 'test',
    logger: logger as any,
    stallDetectionEnabled: false,
  });

  // Register adapter
  const adapter = createAdapter(agentType as any);
  manager.adapters.register(adapter);

  console.log(`\n=== Spawning ${agentType} session ===\n`);

  const session = await manager.spawn({
    name: `test-${Date.now()}`,
    type: agentType,
    workdir: '/tmp',
    cols: 120,
    rows: 40,
    adapterConfig: {
      interactive: true,
      approvalPreset: 'autonomous',
    },
  });

  console.log(`Session: ${session.id}, tmux: ${session.tmuxSessionName}`);
  console.log('Waiting for session_ready...\n');

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('TIMEOUT: session_ready never fired after 30s');
      resolve();
    }, 30000);

    manager.on('session_ready', (s: any) => {
      if (s.id === session.id) {
        clearTimeout(timeout);
        console.log(`session_ready fired! Status: ${s.status}`);
        resolve();
      }
    });
  });

  // Wait settle delay
  const settleMs =
    agentType === 'claude' ? 800 : agentType === 'codex' ? 2000 : 1500;
  console.log(`\nWaiting ${settleMs}ms settle delay...`);
  await new Promise((r) => setTimeout(r, settleMs));

  console.log(`\nSending: "${testMessage.slice(0, 50)}..."`);
  console.log(`Message length: ${testMessage.length} chars`);

  const msg = manager.send(session.id, testMessage);
  console.log(`send() returned: ${msg?.id}`);

  console.log('\nWaiting 30s for task_complete...\n');

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('TIMEOUT: task_complete never fired after 30s');
      resolve();
    }, 30000);

    manager.on('task_complete', (s: any) => {
      if (s.id === session.id) {
        clearTimeout(timeout);
        console.log('task_complete fired! Agent accepted the input.');
        resolve();
      }
    });
  });

  // Capture screen
  const { execSync } = require('node:child_process');
  const screen = execSync(
    `tmux capture-pane -t ${session.tmuxSessionName} -p`
  ).toString();
  console.log('\n=== Screen capture ===');
  console.log(screen.slice(-500));

  console.log('\n=== Cleaning up ===');
  await manager.shutdown();
}

main().catch(console.error);
