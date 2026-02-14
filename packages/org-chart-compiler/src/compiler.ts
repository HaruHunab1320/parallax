/**
 * Org-Chart Compiler
 *
 * Main compiler class for org-chart patterns.
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import type {
  OrgPattern,
  OrgStructure,
  CompileOptions,
  CompileResult,
  CompileTarget,
  CompileContext,
  ValidationResult,
  PatternMetadata,
} from './types';
import { validatePattern } from './validation/validator';
import { builtInTargets, getTarget } from './targets';
import { buildJsonPlan } from './targets/json.target';

/**
 * Custom target registry
 */
const customTargets: Map<string, CompileTarget> = new Map();

/**
 * Org-Chart Compiler
 *
 * Compiles org-chart YAML/JSON patterns to various output formats.
 */
export class OrgChartCompiler {
  /**
   * Parse a YAML or JSON string into an OrgPattern
   */
  static parse(input: string, format: 'yaml' | 'json' = 'yaml'): OrgPattern {
    if (format === 'json') {
      return JSON.parse(input) as OrgPattern;
    }
    return yaml.load(input) as OrgPattern;
  }

  /**
   * Load a pattern from a file
   */
  static async loadFromFile(filePath: string): Promise<OrgPattern> {
    const content = await fs.readFile(filePath, 'utf-8');
    const isJson = filePath.endsWith('.json');
    return this.parse(content, isJson ? 'json' : 'yaml');
  }

  /**
   * Validate a pattern
   */
  static validate(pattern: OrgPattern): ValidationResult {
    return validatePattern(pattern);
  }

  /**
   * Compile a pattern to the specified target
   */
  static compile(pattern: OrgPattern, options: CompileOptions = {}): CompileResult {
    const targetName = typeof options.target === 'string' ? options.target : options.target?.name || 'prism';
    const target = typeof options.target === 'object'
      ? options.target
      : getTarget(targetName) || customTargets.get(targetName);

    if (!target) {
      throw new Error(`Unknown target: ${targetName}. Available targets: ${this.getTargets().join(', ')}`);
    }

    const includeComments = options.includeComments ?? true;

    // Create compilation context
    const ctx: CompileContext = {
      pattern,
      targetName: target.name,
      variables: new Map(),
      stepResults: new Map(),
      indent: 0,
      includeComments,
      addVariable(name: string, reference: string) {
        this.variables.set(name, reference);
      },
      getIndent() {
        return '  '.repeat(this.indent);
      },
    };

    // Generate parts
    const parts: string[] = [];

    // Header
    if (target.emitHeader) {
      parts.push(target.emitHeader(pattern, ctx));
    }

    // Roles
    for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
      parts.push(target.emitRole(role, roleId, ctx));
    }

    // Workflow
    parts.push(target.emitWorkflow(pattern.workflow, ctx));

    // Footer
    if (target.emitFooter) {
      parts.push(target.emitFooter(pattern, ctx));
    }

    // Join output
    const output = target.join(parts);

    // Build metadata
    const metadata = this.extractMetadata(pattern);

    return {
      name: pattern.name,
      output: options.prettyPrint !== false ? output : output.replace(/\n+/g, ' '),
      format: target.format,
      metadata,
    };
  }

  /**
   * Compile from file to file
   */
  static async compileFromFile(
    inputPath: string,
    outputPath?: string,
    options?: CompileOptions
  ): Promise<string> {
    const pattern = await this.loadFromFile(inputPath);
    const result = this.compile(pattern, options);

    // Determine output path
    const ext = result.format === 'json' ? '.json' : result.format === 'yaml' ? '.yaml' : '.prism';
    const outPath = outputPath || inputPath.replace(/\.ya?ml$/, ext);

    // Write output
    await fs.writeFile(outPath, result.output, 'utf-8');

    return outPath;
  }

  /**
   * Compile to JSON execution plan
   */
  static compileToJson(pattern: OrgPattern): object {
    return buildJsonPlan(pattern);
  }

  /**
   * Register a custom target
   */
  static registerTarget(target: CompileTarget): void {
    customTargets.set(target.name, target);
  }

  /**
   * Unregister a custom target
   */
  static unregisterTarget(name: string): boolean {
    return customTargets.delete(name);
  }

  /**
   * Get list of available targets
   */
  static getTargets(): string[] {
    return [...Object.keys(builtInTargets), ...customTargets.keys()];
  }

  /**
   * Get a target by name
   */
  static getTarget(name: string): CompileTarget | undefined {
    return getTarget(name) || customTargets.get(name);
  }

  /**
   * Extract metadata from a pattern
   */
  private static extractMetadata(pattern: OrgPattern): PatternMetadata {
    const capabilities = this.extractCapabilities(pattern.structure);
    const agentCounts = this.calculateAgentCounts(pattern.structure);
    const roles = Object.keys(pattern.structure.roles);

    return {
      name: pattern.name,
      version: pattern.version || '1.0.0',
      description: pattern.description || `Compiled from org-chart: ${pattern.name}`,
      input: pattern.workflow.input || {},
      capabilities,
      agentCounts,
      roles,
    };
  }

  /**
   * Extract all unique capabilities from roles
   */
  private static extractCapabilities(structure: OrgStructure): string[] {
    const capabilities = new Set<string>();

    for (const role of Object.values(structure.roles)) {
      for (const cap of role.capabilities || []) {
        capabilities.add(cap);
      }
    }

    return Array.from(capabilities);
  }

  /**
   * Calculate min/max agent counts from roles
   */
  private static calculateAgentCounts(structure: OrgStructure): { min: number; max: number } {
    let min = 0;
    let max = 0;

    for (const role of Object.values(structure.roles)) {
      if (role.singleton) {
        min += 1;
        max += 1;
      } else {
        min += role.minInstances || 1;
        max += role.maxInstances || role.minInstances || 1;
      }
    }

    return { min, max };
  }
}

/**
 * Create a custom compile target
 */
export function createTarget(config: Partial<CompileTarget> & { name: string }): CompileTarget {
  // Use prism target as base
  return {
    format: config.format || 'code',
    emitHeader: config.emitHeader || (() => ''),
    emitRole: config.emitRole || ((_role, id) => `// Role: ${id}`),
    emitWorkflow: config.emitWorkflow || ((wf) => `// Workflow: ${wf.name}`),
    emitStep: config.emitStep || ((step, idx) => `// Step ${idx}: ${step.type}`),
    emitFooter: config.emitFooter || (() => ''),
    join: config.join || ((parts) => parts.join('\n')),
    ...config,
  };
}
