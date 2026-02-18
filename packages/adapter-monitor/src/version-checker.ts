/**
 * Version Checker
 *
 * Checks for new versions of CLI adapters from npm, pip, and GitHub.
 */

import type { AdapterType, CLIVersionSource, VersionCheckResult } from './types';
import { MONITORED_CLIS } from './config';

/**
 * Fetch latest version from npm registry
 */
async function checkNpmVersion(packageName: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);

  if (!response.ok) {
    throw new Error(`Failed to fetch npm package ${packageName}: ${response.status}`);
  }

  const data = await response.json() as { version: string };
  return data.version;
}

/**
 * Fetch latest version from PyPI
 */
async function checkPipVersion(packageName: string): Promise<string> {
  const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);

  if (!response.ok) {
    throw new Error(`Failed to fetch PyPI package ${packageName}: ${response.status}`);
  }

  const data = await response.json() as { info: { version: string } };
  return data.info.version;
}

/**
 * Fetch latest release from GitHub
 */
async function checkGitHubVersion(repo: string): Promise<{ version: string; url: string }> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      // Add token if available for higher rate limits
      ...(process.env.GITHUB_TOKEN && {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
      }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub releases for ${repo}: ${response.status}`);
  }

  const data = await response.json() as { tag_name: string; html_url: string };

  // Strip 'v' prefix if present
  const version = data.tag_name.replace(/^v/, '');

  return { version, url: data.html_url };
}

/**
 * Check version for a single CLI
 */
export async function checkVersion(source: CLIVersionSource): Promise<VersionCheckResult> {
  let latestVersion: string;
  let changelogUrl: string | undefined;

  try {
    switch (source.registry) {
      case 'npm':
        latestVersion = await checkNpmVersion(source.package);
        changelogUrl = `https://www.npmjs.com/package/${source.package}?activeTab=versions`;
        break;

      case 'pip':
        latestVersion = await checkPipVersion(source.package);
        changelogUrl = `https://pypi.org/project/${source.package}/#history`;
        break;

      case 'github':
        if (!source.githubRepo) {
          throw new Error(`GitHub repo not specified for ${source.type}`);
        }
        const result = await checkGitHubVersion(source.githubRepo);
        latestVersion = result.version;
        changelogUrl = result.url;
        break;

      default:
        throw new Error(`Unknown registry type: ${source.registry}`);
    }

    // Also check GitHub releases if available (for changelog)
    if (source.githubRepo && source.registry !== 'github') {
      try {
        const ghResult = await checkGitHubVersion(source.githubRepo);
        changelogUrl = ghResult.url;
      } catch {
        // GitHub check failed, that's ok - use registry URL
      }
    }

    const updateAvailable = source.currentVersion
      ? latestVersion !== source.currentVersion
      : true;

    return {
      adapter: source.type,
      currentVersion: source.currentVersion || null,
      latestVersion,
      updateAvailable,
      changelogUrl,
    };
  } catch (error) {
    throw new Error(
      `Failed to check version for ${source.type}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check versions for all monitored CLIs
 */
export async function checkAllVersions(
  currentVersions?: Partial<Record<AdapterType, string>>
): Promise<VersionCheckResult[]> {
  const results: VersionCheckResult[] = [];

  for (const [adapter, source] of Object.entries(MONITORED_CLIS)) {
    const sourceWithCurrent = {
      ...source,
      currentVersion: currentVersions?.[adapter as AdapterType],
    };

    try {
      const result = await checkVersion(sourceWithCurrent);
      results.push(result);
    } catch (error) {
      console.error(`Error checking ${adapter}:`, error);
      results.push({
        adapter: adapter as AdapterType,
        currentVersion: sourceWithCurrent.currentVersion || null,
        latestVersion: 'unknown',
        updateAvailable: false,
      });
    }
  }

  return results;
}

/**
 * Filter to only adapters with updates available
 */
export function filterUpdatesAvailable(results: VersionCheckResult[]): VersionCheckResult[] {
  return results.filter((r) => r.updateAvailable && r.latestVersion !== 'unknown');
}
