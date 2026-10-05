#!/usr/bin/env node
/**
 * Production dependency audit gate.
 *
 * Runs `pnpm audit --prod --json` (or reads a saved report with --report) and
 * fails when a high or critical advisory is not covered by an unexpired entry
 * in audit-allowlist.json. Expired or unused allowlist entries also fail, so
 * every exception is revisited instead of silently accumulating.
 *
 * Usage:
 *   node scripts/audit/audit-gate.mjs [--report audit.json] [--today YYYY-MM-DD]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATED = new Set(['high', 'critical']);

/**
 * @param {object} report pnpm audit --json output
 * @param {{ advisories: Array<{ id: string, package: string, reason: string, revisit: string }> }} allowlist
 * @param {string} today ISO date (YYYY-MM-DD)
 * @returns {{ failures: string[], allowed: string[] }}
 */
export function evaluateAudit(report, allowlist, today) {
  const failures = [];
  const allowed = [];
  const entries = new Map();
  for (const entry of allowlist.advisories ?? []) {
    for (const field of ['id', 'package', 'reason', 'revisit']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        failures.push(`allowlist entry ${JSON.stringify(entry)} is missing "${field}"`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.revisit ?? '')) {
      failures.push(`allowlist entry ${entry.id} has an invalid revisit date`);
    } else if (entry.revisit < today) {
      failures.push(
        `allowlist entry ${entry.id} (${entry.package}) expired on ${entry.revisit}; re-assess it`
      );
    }
    entries.set(entry.id, entry);
  }

  const seen = new Set();
  for (const advisory of Object.values(report.advisories ?? {})) {
    if (!GATED.has(advisory.severity)) continue;
    const id = advisory.github_advisory_id ?? String(advisory.id);
    const entry = entries.get(id);
    const label = `${advisory.severity} ${id} ${advisory.module_name}@${advisory.vulnerable_versions}: ${advisory.title}`;
    if (!entry) {
      failures.push(`not allowlisted: ${label}`);
    } else if (entry.package !== advisory.module_name) {
      failures.push(`allowlist entry ${id} names ${entry.package}, advisory is for ${advisory.module_name}`);
    } else {
      seen.add(id);
      allowed.push(`allowlisted until ${entry.revisit}: ${label}`);
    }
  }

  for (const id of entries.keys()) {
    if (!seen.has(id)) {
      failures.push(`allowlist entry ${id} no longer matches a high/critical advisory; remove it`);
    }
  }
  return { failures, allowed };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const reportPath = option('--report');
  const today = option('--today') ?? new Date().toISOString().slice(0, 10);

  let raw;
  if (reportPath) {
    raw = readFileSync(reportPath, 'utf8');
  } else {
    try {
      raw = execFileSync('pnpm', ['audit', '--prod', '--json'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      // pnpm audit exits non-zero when it finds anything; the JSON is still on stdout.
      raw = error.stdout;
      if (!raw) throw error;
    }
  }
  const report = JSON.parse(raw);
  if (report.error) {
    throw new Error(`pnpm audit failed: ${JSON.stringify(report.error)}`);
  }
  const allowlist = JSON.parse(readFileSync(resolve(root, 'audit-allowlist.json'), 'utf8'));
  const { failures, allowed } = evaluateAudit(report, allowlist, today);
  for (const line of allowed) console.log(line);
  if (failures.length > 0) {
    for (const line of failures) console.error(`FAIL ${line}`);
    process.exit(1);
  }
  console.log(`audit gate passed (${allowed.length} documented exception(s))`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
