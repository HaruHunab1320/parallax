import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ParallaxHttpClient } from '../utils/http-client';

type ScenarioSpec = {
  id?: string;
  title?: string;
  description?: string;
  structuredSpec?: {
    goal?: string;
    inputs?: Array<{ name: string; type: string; description?: string; values?: string[] }>;
    decisionPoints?: Array<{
      name: string;
      logic?: string;
      condition?: string;
      outcomes?: Record<string, string>;
      pass?: string;
      fail?: string;
      action?: string;
    }>;
    escalationPaths?: Array<{ trigger: string; destination: string; actions?: string[] }>;
    outputs?: Array<{ name: string; description?: string }>;
  };
};

type ScenarioFile = ScenarioSpec | Record<string, ScenarioSpec>;

function formatInputs(inputs: ScenarioSpec['structuredSpec']['inputs']) {
  if (!inputs || !inputs.length) return 'None';
  return inputs.map((item) => `${item.name}: ${item.type}`).join(', ');
}

function sanitizeId(id: string) {
  return id.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
}

function resolveScenario(data: ScenarioFile, scenarioId?: string): ScenarioSpec {
  if (!scenarioId && 'structuredSpec' in data) {
    return data as ScenarioSpec;
  }
  if (!scenarioId) {
    throw new Error('Scenario file contains multiple entries. Provide --id to select one.');
  }
  const record = data as Record<string, ScenarioSpec>;
  const scenario = record[scenarioId];
  if (!scenario) {
    const keys = Object.keys(record).slice(0, 5).join(', ');
    throw new Error(`Scenario "${scenarioId}" not found. Available: ${keys}${Object.keys(record).length > 5 ? '...' : ''}`);
  }
  return { id: scenarioId, ...scenario };
}

function buildDecisionBlock(name: string, decisionPoint: ScenarioSpec['structuredSpec']['decisionPoints'][number]) {
  const blockName = sanitizeId(name);
  const base = `decision_${blockName}`;
  if (decisionPoint.outcomes) {
    const high = decisionPoint.outcomes.high || 'accept';
    const medium = decisionPoint.outcomes.medium || 'review';
    const low = decisionPoint.outcomes.low || 'escalate';
    return `
${base} = { name: "${name}", outcome: "pending" }
uncertain if (signal) {
  high { ${base} = { name: "${name}", outcome: "high", action: "${high}" } }
  medium { ${base} = { name: "${name}", outcome: "medium", action: "${medium}" } }
  low { ${base} = { name: "${name}", outcome: "low", action: "${low}" } }
}
decisions = decisions.push(${base})`;
  }

  if (decisionPoint.pass || decisionPoint.fail) {
    const pass = decisionPoint.pass || 'pass';
    const fail = decisionPoint.fail || 'fail';
    return `
${base} = { name: "${name}", outcome: "pending" }
if (gate_passed) {
  ${base} = { name: "${name}", outcome: "pass", action: "${pass}" }
} else {
  ${base} = { name: "${name}", outcome: "fail", action: "${fail}" }
}
decisions = decisions.push(${base})`;
  }

  const action = decisionPoint.action || decisionPoint.condition || decisionPoint.logic || 'evaluate';
  return `
${base} = { name: "${name}", outcome: "info", action: "${action}" }
decisions = decisions.push(${base})`;
}

function compileScenarioToPrism(scenario: ScenarioSpec, confidence: number) {
  const id = sanitizeId(scenario.id || scenario.title || 'scenario');
  const title = scenario.title || scenario.id || 'Scenario';
  const description = scenario.description || scenario.structuredSpec?.goal || '';
  const inputs = formatInputs(scenario.structuredSpec?.inputs);
  const decisionPoints = scenario.structuredSpec?.decisionPoints || [];

  const decisionBlocks = decisionPoints.length
    ? decisionPoints.map((point) => buildDecisionBlock(point.name || 'decision', point)).join('\n')
    : 'decisions = decisions.push({ name: "default", outcome: "none", action: "no-op" })';

  return `/**
 * @name ${id}
 * @description ${description}
 * @input ${inputs}
 */
signalConfidence = input.signal_confidence ?? ${confidence.toFixed(2)}
signal = signalConfidence ~> signalConfidence
decisions = []
gate_passed = signalConfidence >= ${confidence.toFixed(2)}

${decisionBlocks}

scenario_result = {
  id: "${id}",
  title: "${title}",
  description: "${description}",
  decisions,
  input
}

scenario_result`;
}

async function readScenarioFile(filePath: string): Promise<ScenarioFile> {
  const content = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(content);
  }
  return yaml.load(content) as ScenarioFile;
}

export const scenarioCommand = new Command('scenario')
  .description('Compile or run scenario specs as Prism patterns');

scenarioCommand
  .command('compile')
  .description('Compile a scenario YAML/JSON file into a Prism pattern')
  .argument('<scenario-file>', 'Path to scenario YAML/JSON')
  .option('--id <scenario-id>', 'Scenario id when file contains multiple entries')
  .option('-o, --output <file>', 'Output .prism path')
  .option('--confidence <value>', 'Fallback confidence value', '0.78')
  .action(async (scenarioFile, options) => {
    const spinner = ora('Compiling scenario...').start();
    try {
      const data = await readScenarioFile(scenarioFile);
      const scenario = resolveScenario(data, options.id);
      const confidence = Number(options.confidence);
      const prism = compileScenarioToPrism(scenario, Number.isFinite(confidence) ? confidence : 0.78);
      const filename = options.output || path.join(process.cwd(), `${sanitizeId(scenario.id || scenario.title || 'scenario')}.prism`);
      await fs.writeFile(filename, prism, 'utf8');
      spinner.succeed(`Generated ${chalk.cyan(path.basename(filename))}`);
      console.log(chalk.gray('Next: copy this pattern into the Parallax patterns directory and reload the control plane.'));
    } catch (error: any) {
      spinner.fail('Scenario compilation failed');
      console.error(error.message || error);
      process.exit(1);
    }
  });

scenarioCommand
  .command('run')
  .description('Compile and execute a scenario against the Parallax control plane')
  .argument('<scenario-file>', 'Path to scenario YAML/JSON')
  .option('--id <scenario-id>', 'Scenario id when file contains multiple entries')
  .option('--confidence <value>', 'Fallback confidence value', '0.78')
  .option('-i, --input <json>', 'Input data as JSON string')
  .option('-f, --file <path>', 'Input data from JSON file')
  .option('--patterns-dir <path>', 'Patterns directory (defaults to PARALLAX_PATTERNS_DIR or ./patterns)')
  .option('--no-reload', 'Skip control plane reload after writing the pattern')
  .action(async (scenarioFile, options) => {
    const spinner = ora('Preparing scenario...').start();
    try {
      const data = await readScenarioFile(scenarioFile);
      const scenario = resolveScenario(data, options.id);
      const confidence = Number(options.confidence);
      const prism = compileScenarioToPrism(scenario, Number.isFinite(confidence) ? confidence : 0.78);

      const patternsDir = options.patternsDir || process.env.PARALLAX_PATTERNS_DIR || path.join(process.cwd(), 'patterns');
      await fs.mkdir(patternsDir, { recursive: true });
      const patternId = sanitizeId(scenario.id || scenario.title || 'scenario');
      const outputPath = path.join(patternsDir, `${patternId}.prism`);
      await fs.writeFile(outputPath, prism, 'utf8');

      const client = new ParallaxHttpClient();
      if (options.reload) {
        spinner.text = 'Reloading patterns...';
        await client.reloadPatterns();
      }

      let inputData: any = { task: scenario.title || 'Scenario run', data: {} };
      if (options.file) {
        const fileContent = await fs.readFile(options.file, 'utf8');
        inputData = JSON.parse(fileContent);
      } else if (options.input) {
        inputData = JSON.parse(options.input);
      }

      spinner.text = `Executing pattern "${patternId}"...`;
      const result = await client.executePattern(patternId, inputData);
      spinner.succeed('Scenario executed');

      console.log(chalk.cyan('\nExecution Result:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Scenario: ') + (scenario.title || patternId));
      console.log(chalk.white('Pattern: ') + patternId);
      console.log(chalk.white('Status: ') + chalk.green(result.status));
      if (result.confidence !== undefined) {
        console.log(chalk.white('Confidence: ') + chalk.yellow(result.confidence.toFixed(2)));
      }
      console.log(chalk.white('\nResult:'));
      console.log(JSON.stringify(result.result, null, 2));
    } catch (error: any) {
      spinner.fail('Scenario run failed');
      console.error(error.message || error);
      process.exit(1);
    }
  });
