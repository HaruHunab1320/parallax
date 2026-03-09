#!/usr/bin/env node

/**
 * postinstall — ensure node-pty's native addon is usable
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
 *
 * Checks two locations:
 *   - node_modules/node-pty              (direct dep / hoisted)
 *   - node_modules/pty-manager/node_modules/node-pty  (nested inside pty-manager)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TAG = '[parallax-agent-runtime]';
const platform = process.platform;
const arch = process.arch;
const platformArch = `${platform}-${arch}`;

// ─── Possible node-pty locations ─────────────────────────────────────────────

function findNodePtyRoots() {
  const roots = [];
  const candidates = [
    // Direct dep or hoisted
    path.join(__dirname, '..', 'node_modules', 'node-pty'),
    // Nested inside pty-manager
    path.join(__dirname, '..', 'node_modules', 'pty-manager', 'node_modules', 'node-pty'),
    // Monorepo hoisted (two levels up)
    path.join(__dirname, '..', '..', 'node-pty'),
    // Monorepo hoisted (three levels up)
    path.join(__dirname, '..', '..', '..', 'node-pty'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      roots.push(candidate);
    }
  }
  return roots;
}

// ─── Step 1: Find the native binary ──────────────────────────────────────────

function findNativeBinary(nodePtyRoot) {
  // Prebuilt (node-pty >= 1.0): prebuilds/<platform>-<arch>/pty.node
  const prebuildPath = path.join(nodePtyRoot, 'prebuilds', platformArch, 'pty.node');
  if (fs.existsSync(prebuildPath)) {
    return { type: 'prebuild', path: prebuildPath };
  }

  // node-gyp compiled: build/Release/pty.node
  const gypPath = path.join(nodePtyRoot, 'build', 'Release', 'pty.node');
  if (fs.existsSync(gypPath)) {
    return { type: 'gyp', path: gypPath };
  }

  return null;
}

// ─── Step 2: Fix spawn-helper permissions ────────────────────────────────────

function fixSpawnHelpers(nodePtyRoot) {
  if (platform === 'win32') return; // No spawn-helper on Windows

  const prebuildsDir = path.join(nodePtyRoot, 'prebuilds');
  if (!fs.existsSync(prebuildsDir)) return;

  let fixed = 0;
  try {
    const entries = fs.readdirSync(prebuildsDir);
    for (const entry of entries) {
      const helperPath = path.join(prebuildsDir, entry, 'spawn-helper');
      if (fs.existsSync(helperPath)) {
        try {
          const stat = fs.statSync(helperPath);
          const isExecutable = (stat.mode & 0o111) !== 0;
          if (!isExecutable) {
            fs.chmodSync(helperPath, 0o755);
            console.log(`${TAG} Fixed spawn-helper permissions: ${helperPath}`);
            fixed++;
          }
        } catch {
          // May not have permission — not fatal
        }
      }
    }
  } catch {
    // prebuilds dir not readable — not fatal
  }

  return fixed;
}

// ─── Step 3: Rebuild if missing ──────────────────────────────────────────────

function rebuildNodePty(nodePtyRoot) {
  console.log(`${TAG} No native binary found — attempting node-gyp rebuild...`);
  try {
    execSync('node-gyp rebuild', {
      cwd: nodePtyRoot,
      stdio: 'pipe',
      timeout: 120_000, // 2-minute timeout
    });
    console.log(`${TAG} node-gyp rebuild succeeded`);
    return true;
  } catch (err) {
    console.warn(`${TAG} node-gyp rebuild failed: ${err.message || err}`);
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const roots = findNodePtyRoots();

  if (roots.length === 0) {
    console.log(`${TAG} node-pty not found in node_modules (will be resolved at runtime)`);
    return;
  }

  let anyBinaryFound = false;

  for (const root of roots) {
    const relPath = path.relative(path.join(__dirname, '..'), root);
    const binary = findNativeBinary(root);

    if (binary) {
      console.log(`${TAG} Found ${binary.type} binary: ${relPath}/${path.relative(root, binary.path)}`);
      anyBinaryFound = true;
    }

    // Always fix spawn-helper permissions regardless of binary status
    fixSpawnHelpers(root);

    // If no binary found at this location, try to rebuild
    if (!binary) {
      const rebuilt = rebuildNodePty(root);
      if (rebuilt) {
        const check = findNativeBinary(root);
        if (check) {
          console.log(`${TAG} Rebuilt binary: ${relPath}/${path.relative(root, check.path)}`);
          anyBinaryFound = true;
        }
      }
    }
  }

  if (!anyBinaryFound) {
    console.warn(`${TAG} WARNING: No node-pty native binary available for ${platformArch}`);
    console.warn(`${TAG} PTY sessions will fail at runtime. Try: cd node_modules/node-pty && node-gyp rebuild`);
  }
}

main();
