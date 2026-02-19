#!/usr/bin/env node
/**
 * Adapter Monitor CLI
 *
 * Commands:
 *   check-versions  - Check for new CLI versions
 *   check-changes   - Check watched source files for changes between versions
 *   watched-files   - List watched source files for an adapter
 *   capture         - Capture startup snapshot
 *   analyze         - Analyze patterns from snapshots
 *   diff            - Compare patterns between versions
 */

import { checkAllVersions, filterUpdatesAvailable } from './version-checker';
import { captureSnapshot } from './snapshot-capture';
import {
  saveSnapshot,
  updateVersionHistory,
  loadVersionHistory,
  loadLatestSnapshot,
  comparePatterns,
  extractPatterns,
} from './snapshot-storage';
import { checkFileChanges, listWatchedFiles } from './file-change-checker';
import { MONITORED_CLIS } from './config';
import { WATCHED_FILES } from './watched-files';
import type { AdapterType } from './types';

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

async function main() {
  const options = parseArgs(args.slice(1));

  switch (command) {
    case 'check-versions': {
      console.error('Checking for CLI version updates...\n');

      const results = await checkAllVersions();
      const updates = filterUpdatesAvailable(results);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const result of results) {
          const status = result.updateAvailable ? '⬆️  UPDATE' : '✓  Current';
          console.log(
            `${status} ${result.adapter}: ${result.currentVersion || 'unknown'} → ${result.latestVersion}`
          );
          if (result.changelogUrl) {
            console.log(`   ${result.changelogUrl}`);
          }
        }

        if (updates.length > 0) {
          console.log(`\n${updates.length} update(s) available.`);
        } else {
          console.log('\nAll adapters are up to date.');
        }
      }
      break;
    }

    case 'capture': {
      const adapter = options.adapter as AdapterType;
      const version = options.version as string;
      const useDocker = options.docker === true;

      if (!adapter || !version) {
        console.error('Usage: capture --adapter <type> --version <version> [--docker]');
        process.exit(1);
      }

      if (!MONITORED_CLIS[adapter]) {
        console.error(`Unknown adapter: ${adapter}`);
        console.error(`Valid adapters: ${Object.keys(MONITORED_CLIS).join(', ')}`);
        process.exit(1);
      }

      console.error(`Capturing snapshot for ${adapter}@${version}...`);
      console.error(`Docker: ${useDocker ? 'yes' : 'no'}`);

      const snapshot = await captureSnapshot(adapter, version, { useDocker });

      // Save snapshot
      const filePath = await saveSnapshot(snapshot);
      console.error(`Snapshot saved to: ${filePath}`);

      // Update version history
      await updateVersionHistory(snapshot);
      console.error('Version history updated.');

      if (options.json) {
        console.log(JSON.stringify(snapshot, null, 2));
      } else {
        console.log('\nSnapshot Summary:');
        console.log(`  Adapter: ${snapshot.adapter}`);
        console.log(`  Version: ${snapshot.version}`);
        console.log(`  Duration: ${snapshot.captureDurationMs}ms`);
        console.log(`  Lines captured: ${snapshot.lines.length}`);
        console.log(`  Patterns detected: ${snapshot.patterns.length}`);
        console.log(`  Auth required: ${snapshot.authRequired}`);
        console.log(`  Reached ready: ${snapshot.reachedReady}`);

        if (snapshot.patterns.length > 0) {
          console.log('\nDetected patterns:');
          for (const pattern of snapshot.patterns) {
            console.log(`  [${pattern.type}] ${pattern.text.slice(0, 60)}...`);
          }
        }
      }
      break;
    }

    case 'analyze': {
      const adapter = options.adapter as AdapterType | undefined;
      const all = options.all === true;

      const adaptersToAnalyze = all
        ? (Object.keys(MONITORED_CLIS) as AdapterType[])
        : adapter
          ? [adapter]
          : [];

      if (adaptersToAnalyze.length === 0) {
        console.error('Usage: analyze --adapter <type> | --all [--json]');
        process.exit(1);
      }

      const results: Array<{
        adapter: AdapterType;
        hasChanges: boolean;
        diff?: ReturnType<typeof comparePatterns>;
      }> = [];

      for (const a of adaptersToAnalyze) {
        console.error(`Analyzing ${a}...`);

        const history = await loadVersionHistory(a);
        const latest = await loadLatestSnapshot(a);

        if (!latest) {
          console.error(`  No snapshot found for ${a}`);
          results.push({ adapter: a, hasChanges: false });
          continue;
        }

        const versions = Object.keys(history.versions).sort();
        const previousVersion = versions.length > 1 ? versions[versions.length - 2] : null;

        if (previousVersion && history.versions[previousVersion]) {
          const oldPatterns = history.versions[previousVersion];
          const newPatterns = extractPatterns(latest);
          const diff = comparePatterns(oldPatterns, newPatterns, a);

          const hasChanges =
            diff.added.ready.length > 0 ||
            diff.removed.ready.length > 0 ||
            diff.added.auth.length > 0 ||
            diff.removed.auth.length > 0;

          results.push({ adapter: a, hasChanges, diff });

          if (!options.json) {
            console.log(`\n${diff.summary}`);
            if (diff.isBreaking) {
              console.log('  ⚠️  BREAKING: Ready patterns removed');
            }
          }
        } else {
          results.push({ adapter: a, hasChanges: true });
          if (!options.json) {
            console.log(`  First snapshot for ${a} - no comparison available`);
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      }
      break;
    }

    case 'diff': {
      const adapter = options.adapter as AdapterType;
      const oldVersion = options.old as string;
      const newVersion = options.new as string;

      if (!adapter || !oldVersion || !newVersion) {
        console.error('Usage: diff --adapter <type> --old <version> --new <version>');
        process.exit(1);
      }

      const history = await loadVersionHistory(adapter);

      const oldPatterns = history.versions[oldVersion];
      const newPatterns = history.versions[newVersion];

      if (!oldPatterns) {
        console.error(`No patterns found for ${adapter}@${oldVersion}`);
        process.exit(1);
      }

      if (!newPatterns) {
        console.error(`No patterns found for ${adapter}@${newVersion}`);
        process.exit(1);
      }

      const diff = comparePatterns(oldPatterns, newPatterns, adapter);

      if (options.json) {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(diff.summary);
        console.log();

        if (diff.added.ready.length) {
          console.log('Added ready patterns:');
          diff.added.ready.forEach((p) => console.log(`  + ${p}`));
        }
        if (diff.removed.ready.length) {
          console.log('Removed ready patterns:');
          diff.removed.ready.forEach((p) => console.log(`  - ${p}`));
        }
        if (diff.added.auth.length) {
          console.log('Added auth patterns:');
          diff.added.auth.forEach((p) => console.log(`  + ${p}`));
        }
        if (diff.removed.auth.length) {
          console.log('Removed auth patterns:');
          diff.removed.auth.forEach((p) => console.log(`  - ${p}`));
        }

        if (diff.isBreaking) {
          console.log('\n⚠️  This is a BREAKING change - ready patterns were removed.');
        }
      }
      break;
    }

    case 'check-changes': {
      const adapter = options.adapter as AdapterType;
      const oldVersion = options.old as string;
      const newVersion = options.new as string;

      if (!adapter || !oldVersion || !newVersion) {
        console.error('Usage: check-changes --adapter <type> --old <version> --new <version> [--json]');
        process.exit(1);
      }

      if (!WATCHED_FILES[adapter]) {
        console.error(`Unknown adapter: ${adapter}`);
        console.error(`Valid adapters: ${Object.keys(WATCHED_FILES).join(', ')}`);
        process.exit(1);
      }

      console.error(`Checking watched file changes for ${adapter}: ${oldVersion} -> ${newVersion}...\n`);

      const result = await checkFileChanges(adapter, oldVersion, newVersion);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.summary);
        if (result.adapterUpdateNeeded) {
          console.log('\nAction required: Review and update adapter patterns.');
        }
      }
      break;
    }

    case 'watched-files': {
      const adapter = options.adapter as AdapterType | undefined;
      const all = options.all === true;

      const adaptersToList = all
        ? (Object.keys(WATCHED_FILES) as AdapterType[])
        : adapter
          ? [adapter]
          : [];

      if (adaptersToList.length === 0) {
        console.error('Usage: watched-files --adapter <type> | --all [--json]');
        process.exit(1);
      }

      const results: Record<string, Record<string, string[]>> = {};

      for (const a of adaptersToList) {
        const grouped = listWatchedFiles(a);
        results[a] = grouped;

        if (!options.json) {
          const config = WATCHED_FILES[a];
          console.log(`\n${a} (${config.githubRepo}):`);
          for (const [category, files] of Object.entries(grouped)) {
            console.log(`  [${category}]`);
            for (const file of files) {
              console.log(`    ${file}`);
            }
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      }
      break;
    }

    case 'help':
    default:
      console.log(`
Adapter Monitor CLI

Commands:
  check-versions          Check for new CLI versions
    --json                Output as JSON

  check-changes           Check watched source files for changes between versions
    --adapter <type>      Adapter type (claude, gemini, codex, aider)
    --old <version>       Old version tag
    --new <version>       New version tag
    --json                Output as JSON

  watched-files           List watched source files for an adapter
    --adapter <type>      Specific adapter
    --all                 List all adapters
    --json                Output as JSON

  capture                 Capture startup snapshot
    --adapter <type>      Adapter type (claude, gemini, codex, aider)
    --version <version>   Version to capture
    --docker              Use Docker for isolation
    --json                Output as JSON

  analyze                 Analyze patterns from snapshots
    --adapter <type>      Specific adapter to analyze
    --all                 Analyze all adapters
    --json                Output as JSON

  diff                    Compare patterns between versions
    --adapter <type>      Adapter type
    --old <version>       Old version
    --new <version>       New version
    --json                Output as JSON

  help                    Show this help message
`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
