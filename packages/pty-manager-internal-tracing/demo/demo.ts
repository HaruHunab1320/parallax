/**
 * pty-manager Demo
 *
 * Demonstrates spawning real shell sessions and running commands.
 * Run with: npx tsx demo/demo.ts
 *
 * Note: Requires node-pty to be installed.
 */

import { PTYManager, ShellAdapter } from '../src';

async function main() {
  console.log('=== PTY Agent Manager Demo ===\n');

  const manager = new PTYManager({
    maxLogLines: 100,
  });

  // Register the shell adapter
  manager.registerAdapter(new ShellAdapter({
    shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
  }));

  // Collect output
  let output = '';
  manager.on('message', (message) => {
    if (message.type === 'output') {
      output += message.content;
    }
  });

  // Subscribe to manager events
  manager.on('session_started', (session) => {
    console.log(`[Event] Session started: ${session.id} (PID: ${session.pid})`);
  });

  manager.on('session_ready', (session) => {
    console.log(`[Event] Session ready: ${session.id}`);
  });

  manager.on('session_stopped', (session, reason) => {
    console.log(`[Event] Session stopped: ${session.id} (${reason})`);
  });

  console.log('Spawning a shell session...\n');

  // Spawn a session
  const session = await manager.spawn({
    id: 'demo-session',
    type: 'shell',
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
  });

  console.log(`Session ID: ${session.id}`);
  console.log(`Session PID: ${session.pid}`);
  console.log(`Status: ${session.status}`);

  // Wait for shell to be ready
  await new Promise(r => setTimeout(r, 500));
  output = ''; // Clear initial prompt

  // Run some commands
  console.log('\n--- Running: echo "Hello from PTY!" ---');
  manager.send(session.id, 'echo "Hello from PTY!"\n');
  await new Promise(r => setTimeout(r, 500));
  console.log('Output:', output.trim());
  output = '';

  console.log('\n--- Running: pwd ---');
  manager.send(session.id, 'pwd\n');
  await new Promise(r => setTimeout(r, 500));
  console.log('Output:', output.trim());
  output = '';

  console.log('\n--- Running: node --version ---');
  manager.send(session.id, 'node --version\n');
  await new Promise(r => setTimeout(r, 500));
  console.log('Output:', output.trim());
  output = '';

  // Get session info
  console.log('\n--- Session Info ---');
  const sessionInfo = manager.get(session.id);
  if (sessionInfo) {
    console.log(`ID: ${sessionInfo.id}`);
    console.log(`PID: ${sessionInfo.pid}`);
    console.log(`Status: ${sessionInfo.status}`);
  }

  // List all sessions
  console.log('\n--- Active Sessions ---');
  const sessions = manager.list();
  console.log(`Total sessions: ${sessions.length}`);
  sessions.forEach(s => {
    console.log(`  - ${s.id} (PID: ${s.pid}, Status: ${s.status})`);
  });

  // Stop the session
  console.log('\nStopping session...');
  await manager.stop(session.id, { force: true });

  console.log('\n=== Demo Complete ===');
  console.log('Successfully spawned a real PTY shell session and ran commands.\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('Demo failed:', error.message);
  console.error('\nMake sure node-pty is installed: npm install node-pty');
  process.exit(1);
});
