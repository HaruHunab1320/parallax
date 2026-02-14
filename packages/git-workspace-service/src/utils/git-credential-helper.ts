/**
 * Git Credential Helper
 *
 * This module provides a Git credential helper that integrates with the
 * workspace service. It can be used in two modes:
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

/**
 * Credential context stored per-workspace
 * This is written to a file that the helper reads
 */
export interface CredentialHelperContext {
  workspaceId: string;
  executionId: string;
  repo: string;
  token: string;
  expiresAt: string;
}

/**
 * Create the credential helper script content (Node.js version)
 */
export function createNodeCredentialHelperScript(contextFilePath: string): string {
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
# Git Credential Helper
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
  context: CredentialHelperContext
): Promise<string> {
  // Create the .git-workspace directory in the workspace
  const helperDir = path.join(workspacePath, '.git-workspace');
  await fs.promises.mkdir(helperDir, { recursive: true });

  // Write the context file
  const contextFilePath = path.join(helperDir, 'credential-context.json');
  await fs.promises.writeFile(
    contextFilePath,
    JSON.stringify(context, null, 2),
    { mode: 0o600 } // Read/write only for owner
  );

  // Create the helper script
  const helperScriptPath = path.join(helperDir, 'git-credential-helper');
  const helperScript = createShellCredentialHelperScript(contextFilePath);
  await fs.promises.writeFile(helperScriptPath, helperScript, { mode: 0o700 });

  // Return the path to the helper script
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
  const contextFilePath = path.join(workspacePath, '.git-workspace', 'credential-context.json');

  // Read existing context
  const existingContent = await fs.promises.readFile(contextFilePath, 'utf8');
  const context: CredentialHelperContext = JSON.parse(existingContent);

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
  const helperDir = path.join(workspacePath, '.git-workspace');
  try {
    await fs.promises.rm(helperDir, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Get the git config commands to configure the credential helper
 */
export function getGitCredentialConfig(helperScriptPath: string): string[] {
  return [
    // Clear any existing helpers
    `git config credential.helper ''`,
    // Use our custom helper script
    `git config --add credential.helper '!${helperScriptPath}'`,
    // Disable interactive prompts
    `git config credential.interactive false`,
  ];
}

/**
 * Output credentials to stdout in Git format
 */
export function outputCredentials(username: string, password: string): void {
  console.log(`username=${username}`);
  console.log(`password=${password}`);
  console.log('');
}
