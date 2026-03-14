# @parallaxai/client

Management SDK for the Parallax AI orchestration platform. Wraps the full REST API for managing patterns, agents, executions, schedules, and more.

For building agents, see the agent SDKs (`@parallaxai/sdk-typescript`, `parallax` for Python, `parallax/sdk-go`, `parallax-sdk` for Rust).

## Installation

```bash
npm install @parallaxai/client
# or
pnpm add @parallaxai/client
```

## Quick Start

```typescript
import { ParallaxClient } from '@parallaxai/client';

// API key auth (OSS or Enterprise)
const client = new ParallaxClient({
  baseUrl: 'http://localhost:8081',
  apiKey: 'plx_your_api_key',
});

// List patterns
const { patterns } = await client.patterns.list();

// Execute a pattern
const execution = await client.executions.create({
  patternName: 'consensus-builder',
  input: { task: 'Analyze sentiment' },
});

// Wait for completion
const result = await client.executions.waitForCompletion(execution.id);
```

## Authentication

```typescript
// API key (recommended for scripts/automation)
const client = new ParallaxClient({
  baseUrl: 'http://localhost:8081',
  apiKey: 'plx_your_key',
});

// JWT auth (for user-facing apps)
const client = new ParallaxClient({
  baseUrl: 'http://localhost:8081',
  auth: { accessToken: 'jwt-token', refreshToken: 'refresh-token' },
  onTokenRefresh: (tokens) => saveTokens(tokens),
});

// Login flow
const { user, tokens } = await client.auth.login('user@example.com', 'password');
```

## Resources

### OSS (always available)

```typescript
// Patterns
await client.patterns.list();
await client.patterns.get('PatternName');
await client.patterns.execute('PatternName', { task: 'analyze' });
await client.patterns.metrics('PatternName');

// Agents
await client.agents.list();
await client.agents.health('agent-id');
await client.agents.capabilityStats();

// Executions
await client.executions.list({ status: 'completed', limit: 10 });
await client.executions.get('exec-id');
await client.executions.cancel('exec-id');
await client.executions.stats();

// Schedules
await client.schedules.create({ name: 'nightly', patternName: 'Cleanup', cron: '0 0 * * *' });
await client.schedules.pause('schedule-id');

// License
await client.license.info();
await client.license.features();

// Managed Agents
await client.managedAgents.spawn({ adapterId: 'claude-code', task: 'review PR' });
await client.managedAgents.list();

// Managed Threads
await client.managedThreads.spawn({ patternName: 'Analysis', input: {} });
```

### Enterprise (requires license)

```typescript
// Pattern Management
await client.patterns.create({ name: 'MyPattern', script: '...' });
await client.patterns.upload('path/to/pattern.prism');

// Triggers
await client.triggers.createWebhook({ name: 'deploy-hook', patternName: 'Deploy' });
await client.triggers.sendWebhook('webhook-id', { event: 'deploy' });

// Auth & Users
await client.auth.register('user@example.com', 'password', 'User Name');
await client.users.list({ role: 'admin' });
await client.users.createApiKey('user-id', { name: 'ci-key' });

// Audit
await client.audit.query({ action: 'delete', limit: 50 });
await client.audit.stats(24);

// Backup & Restore
const backup = await client.backup.export();
await client.backup.restore(backup, 'merge');
```

## Error Handling

```typescript
import { ParallaxError } from '@parallaxai/client';

try {
  await client.patterns.get('NonExistent');
} catch (err) {
  if (err instanceof ParallaxError) {
    if (err.isNotFound) console.log('Pattern not found');
    if (err.isEnterprise) console.log('Requires enterprise license');
    if (err.isForbidden) console.log('Insufficient permissions');
  }
}
```

## License

Apache-2.0
