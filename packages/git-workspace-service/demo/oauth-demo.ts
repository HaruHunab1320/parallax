/**
 * OAuth Device Flow Demo
 *
 * Demonstrates the OAuth Device Code Flow authentication for GitHub.
 *
 * Run with: pnpm tsx demo/oauth-demo.ts
 *
 * Prerequisites:
 *   - A GitHub OAuth App with Device Flow enabled
 *   - Set GITHUB_CLIENT_ID env var (or use the demo client below)
 *
 * This demo will:
 * 1. Display a verification URL and user code
 * 2. Wait for you to authorize in browser
 * 3. Obtain and cache the OAuth token
 * 4. Demonstrate using the token for git credentials
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  CredentialService,
  OAuthDeviceFlow,
  FileTokenStore,
  MemoryTokenStore,
  DEFAULT_AGENT_PERMISSIONS,
  type AuthPromptEmitter,
  type AuthPrompt,
  type AuthResult,
} from '../src';

// Custom prompt emitter that provides nice CLI output
const cliPromptEmitter: AuthPromptEmitter = {
  onAuthRequired(prompt: AuthPrompt): void {
    console.log('\n');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│          GitHub Authorization Required                  │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│  1. Open your browser and go to:                        │`);
    console.log(`│     \x1b[36m${prompt.verificationUri}\x1b[0m${' '.repeat(Math.max(0, 36 - prompt.verificationUri.length))}│`);
    console.log('│                                                         │');
    console.log(`│  2. Enter this code: \x1b[1;33m${prompt.userCode}\x1b[0m${' '.repeat(Math.max(0, 28 - prompt.userCode.length))}│`);
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│  Waiting for authorization... (expires in ${prompt.expiresIn}s)${' '.repeat(Math.max(0, 10 - String(prompt.expiresIn).length))}│`);
    console.log('└─────────────────────────────────────────────────────────┘');
    console.log('\n');
  },

  onAuthComplete(result: AuthResult): void {
    if (result.success) {
      console.log('\n\x1b[32m✓ Authorization successful!\x1b[0m\n');
    } else {
      console.log(`\n\x1b[31m✗ Authorization failed: ${result.error}\x1b[0m\n`);
    }
  },

  onAuthPending(secondsRemaining: number): void {
    process.stdout.write(`\r  Waiting for authorization... ${secondsRemaining}s remaining  `);
  },
};

async function demoDirectDeviceFlow() {
  console.log('=== Demo 1: Direct OAuth Device Flow ===\n');

  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    console.log('\x1b[33mSkipping direct device flow demo - GITHUB_CLIENT_ID not set\x1b[0m\n');
    console.log('Set GITHUB_CLIENT_ID environment variable to test this demo.\n');
    return null;
  }

  const deviceFlow = new OAuthDeviceFlow({
    clientId,
    permissions: DEFAULT_AGENT_PERMISSIONS,
    promptEmitter: cliPromptEmitter,
  });

  try {
    console.log('Starting OAuth device flow...');
    const token = await deviceFlow.authorize();

    console.log('Token obtained successfully!');
    console.log(`  Token type: ${token.tokenType}`);
    console.log(`  Scopes: ${token.scopes.join(', ')}`);
    console.log(`  Expires: ${token.expiresAt?.toISOString() || 'never'}`);
    console.log(`  Has refresh token: ${!!token.refreshToken}`);

    return token;
  } catch (error) {
    console.error('Device flow failed:', error);
    return null;
  }
}

async function demoCredentialServiceWithOAuth() {
  console.log('\n=== Demo 2: CredentialService with OAuth ===\n');

  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    console.log('\x1b[33mSkipping credential service demo - GITHUB_CLIENT_ID not set\x1b[0m\n');
    return;
  }

  // Create a token store (use memory for demo, file for persistence)
  const useFileStore = process.argv.includes('--persist');
  const tokenStore = useFileStore
    ? new FileTokenStore({
        directory: path.join(os.homedir(), '.parallax', 'demo-tokens'),
        encryptionKey: 'demo-encryption-key',
      })
    : new MemoryTokenStore();

  console.log(`Using ${useFileStore ? 'FileTokenStore (persistent)' : 'MemoryTokenStore (ephemeral)'}`);

  // Check for cached token first
  const cachedToken = await tokenStore.get('github');
  if (cachedToken && !tokenStore.isExpired(cachedToken)) {
    console.log('\n\x1b[32mFound valid cached OAuth token!\x1b[0m');
    console.log(`  Created: ${cachedToken.createdAt.toISOString()}`);
    console.log(`  Expires: ${cachedToken.expiresAt?.toISOString() || 'never'}`);
    console.log('  Will use cached token instead of starting device flow.\n');
  }

  // Create credential service with OAuth support
  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
    tokenStore,
    oauth: {
      clientId,
      permissions: DEFAULT_AGENT_PERMISSIONS,
      promptEmitter: cliPromptEmitter,
    },
  });

  // Request credentials (will use cached token or trigger device flow)
  console.log('Requesting credentials for GitHub repository...\n');

  try {
    const credential = await credentialService.getCredentials({
      repo: 'https://github.com/example/repo.git',
      access: 'write',
      context: {
        executionId: 'demo-execution-001',
        taskId: 'demo-task-001',
        agentId: 'demo-agent',
        reason: 'OAuth demo',
      },
    });

    console.log('Credential obtained!');
    console.log(`  ID: ${credential.id}`);
    console.log(`  Type: ${credential.type}`);
    console.log(`  Token length: ${credential.token.length} characters`);
    console.log(`  Permissions: ${credential.permissions.join(', ')}`);
    console.log(`  Expires: ${credential.expiresAt.toISOString()}`);

    // Verify the token works
    console.log('\nVerifying token with GitHub API...');
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${credential.token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (response.ok) {
      const user = await response.json();
      console.log(`\x1b[32m✓ Token is valid!\x1b[0m Authenticated as: ${user.login}`);
    } else {
      console.log(`\x1b[31m✗ Token verification failed: ${response.status}\x1b[0m`);
    }
  } catch (error) {
    console.error('Failed to get credentials:', error);
  }
}

async function demoTokenCaching() {
  console.log('\n=== Demo 3: Token Caching ===\n');

  const tokenStore = new MemoryTokenStore();

  // Simulate saving a token
  const mockToken = {
    accessToken: 'ghu_xxxxxxxxxxxxxxxxxxxx',
    tokenType: 'bearer',
    scopes: ['repo', 'read:user'],
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    provider: 'github' as const,
    permissions: DEFAULT_AGENT_PERMISSIONS,
    createdAt: new Date(),
  };

  console.log('Saving mock token to store...');
  await tokenStore.save('github', mockToken);

  console.log('Retrieving token from store...');
  const retrieved = await tokenStore.get('github');

  if (retrieved) {
    console.log(`  Token retrieved: ${retrieved.accessToken.substring(0, 10)}...`);
    console.log(`  Is expired: ${tokenStore.isExpired(retrieved)}`);
    console.log(`  Needs refresh: ${tokenStore.needsRefresh(retrieved)}`);
  }

  console.log('\nListing all stored providers...');
  const providers = await tokenStore.list();
  console.log(`  Providers: ${providers.join(', ')}`);

  console.log('\nClearing tokens...');
  await tokenStore.clear();
  const afterClear = await tokenStore.list();
  console.log(`  Providers after clear: ${afterClear.length === 0 ? '(empty)' : afterClear.join(', ')}`);
}

async function demoFileTokenStore() {
  console.log('\n=== Demo 4: FileTokenStore with Encryption ===\n');

  const demoDir = path.join(os.tmpdir(), 'parallax-oauth-demo');
  await fs.mkdir(demoDir, { recursive: true });

  const tokenStore = new FileTokenStore({
    directory: demoDir,
    encryptionKey: 'my-secret-encryption-key',
  });

  const mockToken = {
    accessToken: 'ghu_example_access_token_12345',
    tokenType: 'bearer',
    scopes: ['repo', 'read:user'],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    provider: 'github' as const,
    permissions: DEFAULT_AGENT_PERMISSIONS,
    createdAt: new Date(),
  };

  console.log(`Token directory: ${demoDir}`);
  console.log('Saving encrypted token...');
  await tokenStore.save('github', mockToken);

  // Show the encrypted file contents
  const tokenFile = path.join(demoDir, 'github.token');
  const fileContents = await fs.readFile(tokenFile, 'utf-8');
  console.log(`\nEncrypted file contents (first 100 chars):`);
  console.log(`  ${fileContents.substring(0, 100)}...`);
  console.log(`\nNote: The token is encrypted with AES-256-CBC`);

  // Retrieve and verify
  console.log('\nRetrieving and decrypting token...');
  const retrieved = await tokenStore.get('github');
  if (retrieved) {
    console.log(`  Decrypted token: ${retrieved.accessToken}`);
    console.log(`  \x1b[32m✓ Decryption successful!\x1b[0m`);
  }

  // Cleanup
  await fs.rm(demoDir, { recursive: true, force: true });
  console.log('\nCleaned up demo directory.');
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     OAuth Device Flow Demo - Git Workspace Service        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('This demo showcases the OAuth Device Code Flow for GitHub.\n');
  console.log('Environment variables:');
  console.log(`  GITHUB_CLIENT_ID: ${process.env.GITHUB_CLIENT_ID ? 'set' : '\x1b[33mnot set\x1b[0m'}`);
  console.log('\nCommand line options:');
  console.log('  --persist    Use FileTokenStore to persist tokens across runs');
  console.log('  --full       Run full interactive OAuth flow (requires GITHUB_CLIENT_ID)\n');

  // Demo 3 & 4: Non-interactive demos (always run)
  await demoTokenCaching();
  await demoFileTokenStore();

  // Interactive demos (require GITHUB_CLIENT_ID)
  if (process.argv.includes('--full')) {
    await demoDirectDeviceFlow();
    await demoCredentialServiceWithOAuth();
  } else {
    console.log('\n\x1b[36mRun with --full flag to test interactive OAuth flow\x1b[0m\n');
  }

  console.log('\n\x1b[32mDemo complete!\x1b[0m\n');
}

main().catch((error) => {
  console.error('\x1b[31mDemo failed:\x1b[0m', error);
  process.exit(1);
});
