/**
 * Lazy runtime check for node-pty native addon.
 *
 * Called once before the first PTY spawn. Ensures the native binary is
 * loadable and spawn-helper permissions are correct.
 *
 * 1. Finds the binary — checks for prebuilt pty.node under
 *    prebuilds/<platform>-<arch>/ (node-pty >=1.0), then falls back to
 *    checking for a node-gyp compiled build/Release/pty.node
 * 2. Fixes spawn-helper permissions — bun install can strip execute
 *    bits from the spawn-helper Mach-O binary, causing posix_spawnp
 *    failed at runtime. The script chmod 755s all spawn-helpers under
 *    prebuilds/
 * 3. Rebuilds if missing — if no binary is found at all, runs
 *    node-gyp rebuild as a last resort (with a 2-minute timeout)
 */

import { execSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const TAG = '[pty-preflight]';
const platformArch = `${process.platform}-${process.arch}`;

let checked = false;

// ─── Locate node-pty ─────────────────────────────────────────────────────────

function findNodePtyRoots(): string[] {
  const roots: string[] = [];

  // Try to resolve node-pty through the standard require resolution
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePtyMain = require.resolve('node-pty');
    const nodePtyRoot = dirname(dirname(nodePtyMain));
    if (existsSync(join(nodePtyRoot, 'package.json'))) {
      roots.push(nodePtyRoot);
    }
  } catch {
    // not resolvable directly — try known paths
  }

  // Also check common nested locations relative to this package
  const packageRoot = join(__dirname, '..');
  const candidates = [
    join(packageRoot, 'node_modules', 'node-pty'),
    // Monorepo hoisted
    join(packageRoot, '..', 'node-pty'),
    join(packageRoot, '..', '..', 'node-pty'),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(join(candidate, 'package.json')) &&
      !roots.includes(candidate)
    ) {
      roots.push(candidate);
    }
  }

  return roots;
}

// ─── Find native binary ─────────────────────────────────────────────────────

function findNativeBinary(
  nodePtyRoot: string
): { type: string; path: string } | null {
  // Prebuilt (node-pty >= 1.0)
  const prebuildPath = join(nodePtyRoot, 'prebuilds', platformArch, 'pty.node');
  if (existsSync(prebuildPath)) {
    return { type: 'prebuild', path: prebuildPath };
  }

  // node-gyp compiled
  const gypPath = join(nodePtyRoot, 'build', 'Release', 'pty.node');
  if (existsSync(gypPath)) {
    return { type: 'gyp', path: gypPath };
  }

  return null;
}

// ─── Fix spawn-helper permissions ────────────────────────────────────────────

function fixSpawnHelpers(
  nodePtyRoot: string,
  log: (msg: string) => void
): void {
  if (process.platform === 'win32') return;

  const prebuildsDir = join(nodePtyRoot, 'prebuilds');
  if (!existsSync(prebuildsDir)) return;

  try {
    for (const entry of readdirSync(prebuildsDir)) {
      const helperPath = join(prebuildsDir, entry, 'spawn-helper');
      if (existsSync(helperPath)) {
        try {
          const stat = statSync(helperPath);
          if ((stat.mode & 0o111) === 0) {
            chmodSync(helperPath, 0o755);
            log(
              `${TAG} Fixed spawn-helper permissions: ${relative(nodePtyRoot, helperPath)}`
            );
          }
        } catch {
          // Permission denied — not fatal
        }
      }
    }
  } catch {
    // prebuilds dir not readable
  }
}

// ─── Rebuild if missing ──────────────────────────────────────────────────────

function rebuildNodePty(
  nodePtyRoot: string,
  log: (msg: string) => void
): boolean {
  log(`${TAG} No native binary found — attempting node-gyp rebuild...`);
  try {
    execSync('node-gyp rebuild', {
      cwd: nodePtyRoot,
      stdio: 'pipe',
      timeout: 120_000,
    });
    log(`${TAG} node-gyp rebuild succeeded`);
    return true;
  } catch (err) {
    log(
      `${TAG} node-gyp rebuild failed: ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Ensure node-pty is usable. Called once before first spawn.
 * Idempotent — subsequent calls are no-ops.
 *
 * @param log - logger function (defaults to console.log)
 * @throws Error if no native binary can be found or built
 */
export function ensurePty(log: (msg: string) => void = console.log): void {
  if (checked) return;
  checked = true;

  const roots = findNodePtyRoots();

  if (roots.length === 0) {
    throw new Error(
      `${TAG} node-pty not found. Install it with: npm install node-pty`
    );
  }

  let anyBinaryFound = false;

  for (const root of roots) {
    const binary = findNativeBinary(root);

    if (binary) {
      log(`${TAG} Found ${binary.type} binary for ${platformArch}`);
      anyBinaryFound = true;
    }

    // Always fix spawn-helper permissions
    fixSpawnHelpers(root, log);

    // Rebuild if no binary at this location
    if (!binary) {
      if (rebuildNodePty(root, log)) {
        if (findNativeBinary(root)) {
          anyBinaryFound = true;
        }
      }
    }

    // Stop after first location with a working binary
    if (anyBinaryFound) break;
  }

  if (!anyBinaryFound) {
    throw new Error(
      `${TAG} No node-pty native binary available for ${platformArch}. ` +
        `Try: cd node_modules/node-pty && node-gyp rebuild`
    );
  }
}
