import * as fs from 'fs';
import * as path from 'path';
import { ParallaxClient } from '@parallaxai/client';

/**
 * Signal//Noise Demo Orchestration
 *
 * Uses @parallaxai/client to:
 *  1. Upload both patterns (Station + Conversation)
 *  2. Verify agents are registered
 *  3. Execute a single conversation round
 *  4. Optionally create a recurring schedule with output chaining
 *
 * Usage:
 *   PARALLAX_URL=http://localhost:8081 PARALLAX_API_KEY=plx_xxx npx tsx src/demo.ts
 */

const PARALLAX_URL = process.env.PARALLAX_URL || 'http://localhost:8081';
const API_KEY = process.env.PARALLAX_API_KEY || 'plx_admin';

const client = new ParallaxClient({
  baseUrl: PARALLAX_URL,
  apiKey: API_KEY,
});

async function uploadPatterns() {
  const patternsDir = path.resolve(__dirname, '..', '..', 'patterns');

  // Upload SignalNoiseStation pattern
  const stationPath = path.join(patternsDir, 'signal-noise-station.prism');
  console.log('Uploading SignalNoiseStation pattern...');
  const stationResult = await client.patterns.uploadFile(stationPath, true);
  console.log(`  Uploaded: ${stationResult.pattern.name}`);

  // Upload SignalNoiseConversation pattern (the chaining loop pattern)
  const convPath = path.join(patternsDir, 'signal-noise-conversation.prism');
  if (fs.existsSync(convPath)) {
    console.log('Uploading SignalNoiseConversation pattern...');
    const convResult = await client.patterns.uploadFile(convPath, true);
    console.log(`  Uploaded: ${convResult.pattern.name}`);
  } else {
    console.log('  (SignalNoiseConversation pattern not found, skipping)');
  }
}

async function checkAgents() {
  console.log('\nChecking registered agents...');
  const { agents } = await client.agents.list();

  const conversationAgents = agents.filter((a: any) =>
    a.capabilities?.includes('conversation')
  );

  console.log(`  Total agents: ${agents.length}`);
  console.log(`  Conversation-capable: ${conversationAgents.length}`);

  for (const agent of conversationAgents) {
    console.log(`    - ${agent.name} (${agent.id})`);
  }

  if (conversationAgents.length < 2) {
    console.warn('\n  WARNING: Need at least 2 conversation agents for the demo.');
    console.warn('  Start agents with: AGENT_PERSONA=vero npx tsx src/index.ts');
  }

  return conversationAgents.length;
}

async function executeRound(topic: string) {
  console.log(`\nExecuting conversation round: "${topic}"`);

  const execution = await client.executions.create({
    patternName: 'SignalNoiseStation',
    input: {
      task: topic,
      primaryChannel: 'prism',
      priorityWeights: { prism: 0.9, lumina: 0.7, raven: 0.6, '89': 0.5 },
    },
  });

  console.log(`  Execution ID: ${execution.id}`);
  console.log('  Waiting for completion...');

  const result = await client.executions.waitForCompletion(execution.id, 2000, 60000);

  console.log(`  Status: ${result.status}`);

  if (result.result) {
    const raw = result.result as any;
    const output = raw.value || raw;
    console.log('\n  --- Station Output ---');
    console.log(`  Primary: ${output.primary?.agent} (${output.primary?.channel})`);
    console.log(`  Message: ${output.primary?.message?.substring(0, 100)}...`);
    console.log(`  Station confidence: ${output.stationConfidence?.toFixed(2)}`);
    console.log(`  Agent count: ${output.agentCount}`);
    if (output.background?.length) {
      console.log('  Background:');
      for (const bg of output.background) {
        console.log(`    - ${bg.agent} (${bg.channel}): dominance=${bg.dominance?.toFixed(2)}`);
      }
    }
  }

  return result;
}

async function createConversationSchedule() {
  console.log('\nCreating conversation loop schedule...');

  const schedule = await client.schedules.create({
    name: 'signal-noise-conversation',
    patternName: 'SignalNoiseConversation',
    cron: '*/2 * * * *', // Every 2 minutes
    input: {
      topic: 'What are you working on and what interests you right now?',
      priorityWeights: { prism: 0.9, lumina: 0.7, raven: 0.6, '89': 0.5 },
    },
    metadata: {
      chainOutput: true, // Pass previous result as input.previousResult
    },
  });

  console.log(`  Schedule ID: ${schedule.id}`);
  console.log(`  Status: ${schedule.status}`);
  console.log(`  Cron: ${schedule.cronExpression}`);
  console.log('  Output chaining: enabled');
  console.log('\n  The agents will now converse every 2 minutes,');
  console.log('  rotating the primary speaker based on confidence dominance.');
}

async function listPatterns() {
  const { patterns } = await client.patterns.list();
  console.log('\nAvailable patterns:');
  for (const p of patterns) {
    console.log(`  - ${p.name} (v${p.version || '?'})`);
  }
}

// --- CLI ---

async function main() {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'upload':
      await uploadPatterns();
      break;

    case 'status':
      await listPatterns();
      await checkAgents();
      break;

    case 'run': {
      const topic = process.argv[3] || 'What are you working on and what interests you right now?';
      await checkAgents();
      await executeRound(topic);
      break;
    }

    case 'schedule':
      await createConversationSchedule();
      break;

    case 'full': {
      // Full demo: upload, check, execute, schedule
      await uploadPatterns();
      const agentCount = await checkAgents();
      if (agentCount >= 2) {
        await executeRound('What are you working on and what interests you right now?');
        await createConversationSchedule();
      }
      break;
    }

    default:
      console.log(`
Signal//Noise Demo — powered by @parallaxai/client

Commands:
  upload    Upload patterns to control plane
  status    Check patterns and agents
  run       Execute a single conversation round
  schedule  Create recurring conversation schedule
  full      Upload + check + execute + schedule

Environment:
  PARALLAX_URL      Control plane URL (default: http://localhost:8081)
  PARALLAX_API_KEY  API key (default: plx_admin)

Examples:
  npx tsx src/demo.ts upload
  npx tsx src/demo.ts run "Discuss the future of AI orchestration"
  npx tsx src/demo.ts full
`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
