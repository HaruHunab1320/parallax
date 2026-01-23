/**
 * YAML to Prism Compiler
 *
 * Compiles declarative YAML patterns into executable Prism DSL.
 * This allows developers to write familiar YAML while getting
 * the full power of Prism's uncertainty-aware execution.
 */

import * as yaml from 'js-yaml';
import { YamlPattern, YamlPatternSchema, ResultGroup, Aggregation, Step } from './types';

export interface CompileOptions {
  /** Add comments explaining the generated code */
  comments?: boolean;
  /** Minify the output */
  minify?: boolean;
  /** Validate the YAML before compiling */
  validate?: boolean;
}

export interface CompileResult {
  prism: string;
  warnings: string[];
  metadata: {
    name: string;
    version: string;
    groups: string[];
    hasSteps: boolean;
    confidenceMethod: string;
  };
}

/**
 * Compile YAML pattern to Prism DSL
 */
export function compileYamlToPrism(
  yamlContent: string,
  options: CompileOptions = {}
): CompileResult {
  const { comments = true, validate = true } = options;
  const warnings: string[] = [];

  // Parse YAML
  const rawPattern = yaml.load(yamlContent) as any;

  // Validate if requested
  let pattern: YamlPattern;
  if (validate) {
    const result = YamlPatternSchema.safeParse(rawPattern);
    if (!result.success) {
      throw new Error(`Invalid YAML pattern: ${result.error.message}`);
    }
    pattern = result.data;
  } else {
    pattern = rawPattern as YamlPattern;
  }

  const lines: string[] = [];

  // Generate metadata header
  lines.push(generateMetadata(pattern));
  lines.push('');

  // Generate the main script
  if (pattern.steps && pattern.steps.length > 0) {
    // Multi-step pattern
    lines.push(generateMultiStepPattern(pattern, comments, warnings));
  } else {
    // Simple single-phase pattern
    lines.push(generateSimplePattern(pattern, comments, warnings));
  }

  const prism = lines.join('\n');

  return {
    prism,
    warnings,
    metadata: {
      name: pattern.name,
      version: pattern.version || '1.0.0',
      groups: pattern.groups ? Object.keys(pattern.groups) : [],
      hasSteps: !!(pattern.steps && pattern.steps.length > 0),
      confidenceMethod: typeof pattern.confidence === 'string'
        ? pattern.confidence
        : pattern.confidence?.method || 'average',
    },
  };
}

/**
 * Generate JSDoc metadata header
 */
function generateMetadata(pattern: YamlPattern): string {
  const lines = ['/**'];
  lines.push(` * @name ${pattern.name}`);
  lines.push(` * @version ${pattern.version || '1.0.0'}`);
  lines.push(` * @description ${pattern.description}`);

  // Generate input schema
  const inputSchema = generateInputSchema(pattern.input);
  lines.push(` * @input ${JSON.stringify(inputSchema)}`);

  // Generate agent requirements
  if (pattern.agents) {
    lines.push(` * @agents ${JSON.stringify({ capabilities: pattern.agents.capabilities })}`);
    lines.push(` * @minAgents ${pattern.agents.min || 1}`);
    if (pattern.agents.max) {
      lines.push(` * @maxAgents ${pattern.agents.max}`);
    }
  }

  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generate JSON schema from input definition
 */
function generateInputSchema(input: Record<string, any>): any {
  const properties: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      // Shorthand: "document: string"
      properties[key] = { type: value };
    } else {
      // Full definition
      properties[key] = { type: value.type };
      if (value.description) {
        properties[key].description = value.description;
      }
    }
  }

  return { type: 'object', properties };
}

/**
 * Generate simple single-phase pattern
 */
function generateSimplePattern(
  pattern: YamlPattern,
  comments: boolean,
  warnings: string[]
): string {
  const lines: string[] = [];

  // Collect agent results
  if (comments) lines.push('// Collect results from all agents');
  lines.push('results = agentResults');
  lines.push('');

  // Filter valid results
  if (comments) lines.push('// Filter to only successful results');
  lines.push('validResults = results.filter(r => r.confidence > 0 && r.result)');
  lines.push('');

  // Generate group filters
  if (pattern.groups) {
    if (comments) lines.push('// Group results by type');
    for (const [groupName, group] of Object.entries(pattern.groups)) {
      lines.push(generateGroupFilter(groupName, group));
    }
    lines.push('');

    // Extract first result from each group
    if (comments) lines.push('// Get first result from each group');
    for (const groupName of Object.keys(pattern.groups)) {
      lines.push(`${groupName}Check = ${groupName}Results.length > 0 ? ${groupName}Results.reduce((acc, r) => r, null) : null`);
    }
    lines.push('');
  }

  // Generate aggregation if specified
  if (pattern.aggregation) {
    lines.push(generateAggregation(pattern.aggregation, comments));
    lines.push('');
  }

  // Generate output mapping
  if (comments) lines.push('// Build output');
  lines.push(generateOutputMapping(pattern.output, pattern.groups));
  lines.push('');

  // Generate confidence calculation
  lines.push(generateConfidenceCalculation(pattern.confidence, pattern.groups, comments));
  lines.push('');

  // Generate fallback if specified
  if (pattern.fallback) {
    lines.push(generateFallback(pattern.fallback, comments));
    lines.push('');
  }

  // Final output with confidence
  if (comments) lines.push('// Return with confidence');
  lines.push('output ~> finalConfidence');

  return lines.join('\n');
}

/**
 * Generate multi-step pattern
 */
function generateMultiStepPattern(
  pattern: YamlPattern,
  comments: boolean,
  warnings: string[]
): string {
  const lines: string[] = [];

  warnings.push('Multi-step patterns are experimental');

  // For now, treat steps as sequential phases
  // In future, could support parallel steps, conditions, etc.

  if (comments) lines.push('// Multi-step pattern execution');
  lines.push('results = agentResults');
  lines.push('validResults = results.filter(r => r.confidence > 0 && r.result)');
  lines.push('');

  // Process each step's groups
  for (const step of pattern.steps!) {
    if (step.groups) {
      if (comments) lines.push(`// Step: ${step.name}`);
      for (const [groupName, group] of Object.entries(step.groups)) {
        lines.push(generateGroupFilter(groupName, group));
        lines.push(`${groupName}Check = ${groupName}Results.length > 0 ? ${groupName}Results.reduce((acc, r) => r, null) : null`);
      }
      lines.push('');
    }
  }

  // Generate output
  if (comments) lines.push('// Build output');
  lines.push(generateOutputMapping(pattern.output, pattern.groups));
  lines.push('');

  // Confidence
  lines.push(generateConfidenceCalculation(pattern.confidence, pattern.groups, comments));
  lines.push('');

  lines.push('output ~> finalConfidence');

  return lines.join('\n');
}

/**
 * Generate filter for a result group
 */
function generateGroupFilter(groupName: string, group: ResultGroup): string {
  // Convert YAML match expression to Prism filter
  const filterExpr = convertMatchExpression(group.match);
  return `${groupName}Results = validResults.filter(r => ${filterExpr})`;
}

/**
 * Convert YAML match expression to Prism
 * Handles: "result.analysisType == 'summary'" style expressions
 */
function convertMatchExpression(match: string): string {
  // The match expression is already close to JS/Prism syntax
  // Just need to prefix with 'r.' if not already
  let expr = match;

  // Replace 'result.' with 'r.result.'
  expr = expr.replace(/\bresult\./g, 'r.result.');

  // Replace 'confidence' with 'r.confidence'
  expr = expr.replace(/\bconfidence\b(?!\.)/g, 'r.confidence');

  return expr;
}

/**
 * Generate aggregation code
 */
function generateAggregation(aggregation: Aggregation, comments: boolean): string {
  const lines: string[] = [];

  switch (aggregation.strategy) {
    case 'consensus':
      if (comments) lines.push('// Build consensus from results');
      lines.push(`threshold = ${aggregation.threshold || 0.7}`);
      lines.push('agreements = validResults.filter(r => r.confidence >= threshold)');
      lines.push('hasConsensus = agreements.length >= (validResults.length * 0.5)');
      break;

    case 'voting':
      if (comments) lines.push('// Tally votes');
      lines.push('votes = validResults.map(r => r.result.decision || r.result.vote)');
      lines.push('voteCounts = {}');
      // Note: Prism would need to support this kind of iteration
      break;

    case 'merge':
      if (comments) lines.push('// Merge results');
      lines.push('merged = validResults.reduce((acc, r) => ({ ...acc, ...r.result }), {})');
      break;

    case 'best':
      if (comments) lines.push('// Select best result');
      lines.push('sorted = validResults.sort((a, b) => b.confidence - a.confidence)');
      lines.push('best = sorted.length > 0 ? sorted[0] : null');
      break;
  }

  return lines.join('\n');
}

/**
 * Generate output mapping code
 */
function generateOutputMapping(
  output: Record<string, any>,
  groups?: Record<string, ResultGroup>
): string {
  // Convert output spec to Prism object literal
  const prismOutput = convertOutputToprism(output, groups ? Object.keys(groups) : []);
  return `output = ${prismOutput}`;
}

/**
 * Recursively convert output spec to Prism code
 */
function convertOutputToprism(obj: any, groupNames: string[], depth = 0): string {
  const indent = '  '.repeat(depth);
  const innerIndent = '  '.repeat(depth + 1);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // Check if it's a reference
    if (obj.startsWith('$')) {
      return convertReference(obj, groupNames);
    }
    return JSON.stringify(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(item => convertOutputToprism(item, groupNames, depth + 1));
    return `[\n${innerIndent}${items.join(`,\n${innerIndent}`)}\n${indent}]`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';

    const props = entries.map(([key, value]) => {
      const prismValue = convertOutputToprism(value, groupNames, depth + 1);
      return `${innerIndent}${key}: ${prismValue}`;
    });

    return `{\n${props.join(',\n')}\n${indent}}`;
  }

  return String(obj);
}

/**
 * Convert $reference to Prism expression
 */
function convertReference(ref: string, groupNames: string[]): string {
  // Remove $ prefix
  const path = ref.substring(1);

  // Check for special references
  if (path === 'input') {
    return 'input';
  }

  if (path.startsWith('input.')) {
    return path; // input.data.query etc
  }

  // Check if it starts with a known group name
  for (const groupName of groupNames) {
    if (path === groupName) {
      return `${groupName}Check ? ${groupName}Check.result : null`;
    }
    if (path.startsWith(`${groupName}.`)) {
      const rest = path.substring(groupName.length + 1);
      return `${groupName}Check ? ${groupName}Check.${rest} : null`;
    }
  }

  // Check for built-in references
  if (path === 'avgConfidence' || path === 'averageConfidence') {
    return 'avgConfidence';
  }

  if (path === 'validResults') {
    return 'validResults';
  }

  if (path === 'totalCount') {
    return 'validResults.length';
  }

  // Default: treat as direct reference
  return path;
}

/**
 * Generate confidence calculation code
 */
function generateConfidenceCalculation(
  confidence: any,
  groups?: Record<string, ResultGroup>,
  comments?: boolean
): string {
  const lines: string[] = [];

  const method = typeof confidence === 'string' ? confidence : confidence?.method || 'average';

  if (comments) lines.push(`// Calculate confidence (${method})`);

  switch (method) {
    case 'average':
      lines.push('confidenceSum = validResults.reduce((sum, r) => sum + r.confidence, 0)');
      lines.push('finalConfidence = validResults.length > 0 ? confidenceSum / validResults.length : 0');
      break;

    case 'min':
      lines.push('finalConfidence = validResults.length > 0 ? validResults.reduce((min, r) => r.confidence < min ? r.confidence : min, 1) : 0');
      break;

    case 'max':
      lines.push('finalConfidence = validResults.length > 0 ? validResults.reduce((max, r) => r.confidence > max ? r.confidence : max, 0) : 0');
      break;

    case 'weighted':
      if (typeof confidence === 'object' && confidence.weights) {
        // Generate weighted calculation based on groups
        const weights = confidence.weights;
        const weightEntries = Object.entries(weights);
        lines.push('weightedSum = 0');
        lines.push('totalWeight = 0');
        for (const [groupName, weight] of weightEntries) {
          lines.push(`${groupName}Conf = ${groupName}Check ? ${groupName}Check.confidence : 0`);
          lines.push(`weightedSum = weightedSum + (${groupName}Conf * ${weight})`);
          lines.push(`totalWeight = totalWeight + ${weight}`);
        }
        lines.push('finalConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0');
      } else {
        // Default to average if no weights specified
        lines.push('confidenceSum = validResults.reduce((sum, r) => sum + r.confidence, 0)');
        lines.push('finalConfidence = validResults.length > 0 ? confidenceSum / validResults.length : 0');
      }
      break;

    case 'custom':
      if (typeof confidence === 'object' && confidence.expression) {
        lines.push(`finalConfidence = ${confidence.expression}`);
      } else {
        lines.push('finalConfidence = 0.5');
      }
      break;

    default:
      lines.push('confidenceSum = validResults.reduce((sum, r) => sum + r.confidence, 0)');
      lines.push('finalConfidence = validResults.length > 0 ? confidenceSum / validResults.length : 0');
  }

  return lines.join('\n');
}

/**
 * Generate fallback code
 */
function generateFallback(
  fallback: { condition: string; action: string; target?: string; value?: any; maxRetries?: number },
  comments: boolean
): string {
  const lines: string[] = [];

  if (comments) lines.push('// Fallback handling');

  // Convert condition
  const condition = fallback.condition
    .replace(/\bconfidence\b/g, 'finalConfidence');

  lines.push(`needsFallback = ${condition}`);

  switch (fallback.action) {
    case 'escalate':
      lines.push(`escalationTarget = needsFallback ? "${fallback.target || 'human'}" : null`);
      break;
    case 'retry':
      lines.push(`shouldRetry = needsFallback`);
      lines.push(`maxRetries = ${fallback.maxRetries || 3}`);
      break;
    case 'default':
      lines.push(`output = needsFallback ? ${JSON.stringify(fallback.value)} : output`);
      break;
  }

  return lines.join('\n');
}

/**
 * Convenience function to compile from file path
 */
export async function compileYamlFile(
  filePath: string,
  options?: CompileOptions
): Promise<CompileResult> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return compileYamlToPrism(content, options);
}
