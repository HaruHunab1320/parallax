/**
 * Git Credential Helper for Parallax
 *
 * This module provides a Git credential helper that integrates with the
 * Parallax credential service. It can be used in two modes:
 *
 * 1. Script mode: Run as a standalone script that Git calls
 * 2. Embedded mode: Used within the workspace service to configure git
 *
 * Git credential helpers receive input on stdin in the format:
 *   protocol=https
 *   host=github.com
 *   path=owner/repo
 *
 * And respond with:
 *   username=x-access-token
 *   password=<token>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Credential context stored per-workspace
 * This is written to a file that the helper reads
 */
export interface CredentialContext {
  workspaceId: string;
  executionId: string;
  repo: string;
  token: string;
  expiresAt: string;
}

/**
 * Git credential request parsed from stdin
 */
interface CredentialRequest {
  protocol?: string;
  host?: string;
  path?: string;
  username?: string;
}

/**
 * Create the credential helper script content
 * This script is written to the workspace and configured in git
 */
export function createCredentialHelperScript(contextFilePath: string): string {
  // The script reads the context file and outputs credentials
  // Using node to execute inline JavaScript for portability
  return `#!/usr/bin/env node
const fs = require('fs');
const readline = require('readline');

const contextFile = '${contextFilePath}';

async function main() {
  // Parse input from git
  const rl = readline.createInterface({ input: process.stdin });
  const request = {};

  for await (const line of rl) {
    if (!line.trim()) break;
    const [key, value] = line.split('=');
    if (key && value !== undefined) {
      request[key.trim()] = value.trim();
    }
  }

  // Read context file
  try {
    const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

    // Check expiration
    if (new Date(context.expiresAt) < new Date()) {
      console.error('Credential expired');
      process.exit(1);
    }

    // Output credentials
    console.log('username=x-access-token');
    console.log('password=' + context.token);
    console.log('');
  } catch (error) {
    console.error('Failed to read credentials:', error.message);
    process.exit(1);
  }
}

main();
`;
}

/**
 * Create a shell-based credential helper script (more portable)
 */
export function createShellCredentialHelperScript(contextFilePath: string): string {
  return `#!/bin/sh
# Parallax Git Credential Helper
# Reads credentials from: ${contextFilePath}

# Read the context file
if [ ! -f "${contextFilePath}" ]; then
  echo "Credential context file not found" >&2
  exit 1
fi

# Parse JSON and extract token (using basic shell tools)
TOKEN=$(cat "${contextFilePath}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
EXPIRES=$(cat "${contextFilePath}" | grep -o '"expiresAt":"[^"]*"' | cut -d'"' -f4)

# Check if we got a token
if [ -z "$TOKEN" ]; then
  echo "No token found in credential context" >&2
  exit 1
fi

# Output credentials in git credential format
echo "username=x-access-token"
echo "password=$TOKEN"
echo ""
`;
}

/**
 * Configure git to use the credential helper in a workspace
 */
export async function configureCredentialHelper(
  workspacePath: string,
  context: CredentialContext
): Promise<string> {
  // Create the .parallax directory in the workspace
  const parallaxDir = path.join(workspacePath, '.parallax');
  await fs.promises.mkdir(parallaxDir, { recursive: true });

  // Write the context file
  const contextFilePath = path.join(parallaxDir, 'credential-context.json');
  await fs.promises.writeFile(
    contextFilePath,
    JSON.stringify(context, null, 2),
    { mode: 0o600 } // Read/write only for owner
  );

  // Create the helper script
  const helperScriptPath = path.join(parallaxDir, 'git-credential-helper');
  const helperScript = createShellCredentialHelperScript(contextFilePath);
  await fs.promises.writeFile(helperScriptPath, helperScript, { mode: 0o700 });

  // Return the git config command to use this helper
  return helperScriptPath;
}

/**
 * Update credentials for an existing workspace
 * Called when credentials are refreshed
 */
export async function updateCredentials(
  workspacePath: string,
  newToken: string,
  newExpiresAt: string
): Promise<void> {
  const contextFilePath = path.join(workspacePath, '.parallax', 'credential-context.json');

  // Read existing context
  const existingContent = await fs.promises.readFile(contextFilePath, 'utf8');
  const context: CredentialContext = JSON.parse(existingContent);

  // Update token and expiry
  context.token = newToken;
  context.expiresAt = newExpiresAt;

  // Write back
  await fs.promises.writeFile(
    contextFilePath,
    JSON.stringify(context, null, 2),
    { mode: 0o600 }
  );
}

/**
 * Clean up credential files from a workspace
 */
export async function cleanupCredentialFiles(workspacePath: string): Promise<void> {
  const parallaxDir = path.join(workspacePath, '.parallax');
  try {
    await fs.promises.rm(parallaxDir, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Get the git config commands to configure the credential helper
 */
export function getGitCredentialConfig(helperScriptPath: string): string[] {
  return [
    // Use store helper with our custom script
    `git config credential.helper ''`, // Clear any existing helpers
    `git config --add credential.helper '!${helperScriptPath}'`,
    // Disable interactive prompts
    `git config credential.interactive false`,
  ];
}

/**
 * Parse credential request from Git (for standalone script mode)
 */
export async function parseCredentialRequest(): Promise<CredentialRequest> {
  const rl = readline.createInterface({ input: process.stdin });
  const request: CredentialRequest = {};

  for await (const line of rl) {
    if (!line.trim()) break;
    const [key, value] = line.split('=');
    if (key && value !== undefined) {
      request[key.trim() as keyof CredentialRequest] = value.trim();
    }
  }

  return request;
}

/**
 * Output credentials to stdout in Git format
 */
export function outputCredentials(username: string, password: string): void {
  console.log(`username=${username}`);
  console.log(`password=${password}`);
  console.log('');
}

// ─────────────────────────────────────────────────────────────
// Standalone Script Entry Point
// ─────────────────────────────────────────────────────────────

/**
 * Run as standalone credential helper
 * Called by git with: git-credential-helper get
 */
export async function runAsCredentialHelper(contextFilePath: string): Promise<void> {
  const operation = process.argv[2]; // get, store, or erase

  if (operation !== 'get') {
    // We only handle 'get' - store and erase are no-ops
    process.exit(0);
  }

  try {
    // Parse request from git
    const request = await parseCredentialRequest();

    // Read context
    const contextContent = await fs.promises.readFile(contextFilePath, 'utf8');
    const context: CredentialContext = JSON.parse(contextContent);

    // Verify the request matches our context (optional security check)
    if (request.host && !context.repo.includes(request.host)) {
      console.error(`Host mismatch: ${request.host} vs ${context.repo}`);
      process.exit(1);
    }

    // Check expiration
    if (new Date(context.expiresAt) < new Date()) {
      console.error('Credential has expired');
      process.exit(1);
    }

    // Output credentials
    outputCredentials('x-access-token', context.token);
  } catch (error) {
    console.error(`Credential helper error: ${error}`);
    process.exit(1);
  }
}

// If run directly as a script
if (require.main === module) {
  const contextFile = process.env.PARALLAX_CREDENTIAL_CONTEXT;
  if (!contextFile) {
    console.error('PARALLAX_CREDENTIAL_CONTEXT environment variable not set');
    process.exit(1);
  }
  runAsCredentialHelper(contextFile).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
