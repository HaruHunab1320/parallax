import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { Logger } from 'pino';
import { patternManifest, type PatternModule } from '@parallaxai/patterns';
import { compileOrgPattern, type OrgPattern } from '../org-patterns';
import type { Pattern } from './types';

/**
 * Sources patterns from two places:
 *  - TypeScript modules registered in @parallaxai/patterns (custom logic,
 *    deployed with the control plane)
 *  - Org-chart YAML files in the patterns directory (declarative topology,
 *    executed by the workflow executor)
 */
export class PatternLoader {
  private patterns: Map<string, Pattern> = new Map();
  private modules: Map<string, PatternModule> = new Map();
  private logger: Logger;

  constructor(
    private patternsDir: string,
    logger: Logger
  ) {
    this.logger = logger;
  }

  async loadPatterns(): Promise<void> {
    try {
      this.patterns.clear();
      this.modules.clear();

      this.loadModulePatterns();

      // Load YAML org-chart files from the patterns directory
      await fs.mkdir(this.patternsDir, { recursive: true });
      const files = await fs.readdir(this.patternsDir);
      const yamlFiles = files.filter(
        (f) => f.endsWith('.yaml') || f.endsWith('.yml')
      );
      for (const file of yamlFiles) {
        await this.loadYamlPattern(path.join(this.patternsDir, file));
      }

      this.logger.info(
        {
          total: this.patterns.size,
          modules: this.modules.size,
          yaml: yamlFiles.length,
        },
        'Patterns loaded'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to load patterns');
      throw error;
    }
  }

  /**
   * Register the TypeScript pattern modules shipped in @parallaxai/patterns.
   */
  private loadModulePatterns(): void {
    for (const module of Object.values(patternManifest)) {
      const meta = module.meta;
      const pattern: Pattern = {
        name: meta.name,
        version: meta.version,
        description: meta.description,
        input: (meta.input as Pattern['input']) ?? { type: 'any' },
        agents:
          meta.capabilities || meta.minConfidence !== undefined
            ? {
                capabilities: meta.capabilities,
                minConfidence: meta.minConfidence,
              }
            : undefined,
        minAgents: meta.minAgents,
        maxAgents: meta.maxAgents,
        script: `module:${meta.name}`,
        metadata: { ...(meta.metadata ?? {}), source: 'module' },
      };

      if (this.patterns.has(meta.name)) {
        this.logger.warn(
          { pattern: meta.name },
          'Duplicate pattern name in module manifest — overwriting'
        );
      }
      this.patterns.set(meta.name, pattern);
      this.modules.set(meta.name, module);
      this.logger.debug({ pattern: meta.name, source: 'module' }, 'Pattern loaded');
    }
  }

  /**
   * Load a YAML org-chart pattern. The compiled workflow executes via
   * WorkflowExecutor; the raw YAML is kept for persistence.
   */
  private async loadYamlPattern(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const orgPattern = yaml.load(content) as OrgPattern;

      if (!orgPattern.name) {
        orgPattern.name = path.basename(filePath).replace(/\.ya?ml$/, '');
      }

      const compiled = compileOrgPattern(orgPattern, { includeComments: true });

      // Ensure input has required 'type' property for PatternInput
      const inputConfig = compiled.metadata.input;
      const patternInput =
        inputConfig && typeof inputConfig === 'object' && 'type' in inputConfig
          ? (inputConfig as { type: string; required?: boolean; schema?: any })
          : { type: 'object', schema: inputConfig };

      const pattern: Pattern = {
        name: compiled.name,
        version: compiled.metadata.version,
        description: compiled.metadata.description,
        input: patternInput,
        agents: compiled.metadata.agents,
        threads: compiled.metadata.threads as any,
        minAgents: compiled.metadata.agents.minAgents,
        maxAgents: compiled.metadata.agents.maxAgents,
        script: compiled.script,
        workspace:
          orgPattern.metadata?.workspace || (orgPattern as any).workspace,
        metadata: {
          source: 'yaml',
          compiledFrom: filePath,
          sourceYaml: content,
          orgChart: true,
          ...(compiled.metadata.metadata || {}),
        },
      };

      if (this.validatePattern(pattern)) {
        this.patterns.set(pattern.name, pattern);
        this.logger.debug(
          { pattern: pattern.name },
          'Org-chart pattern loaded'
        );
      }
    } catch (error) {
      this.logger.error({ filePath, error }, 'Failed to load YAML pattern');
    }
  }

  private validatePattern(pattern: Pattern): boolean {
    if (!pattern.name) {
      this.logger.warn({ pattern }, 'Pattern missing name');
      return false;
    }
    return true;
  }

  getPattern(name: string): Pattern | undefined {
    return this.patterns.get(name);
  }

  /** The executable module for a pattern, when it is module-backed. */
  getModule(name: string): PatternModule | undefined {
    return this.modules.get(name);
  }

  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  async reloadPattern(name: string): Promise<void> {
    for (const ext of ['yaml', 'yml']) {
      const filePath = path.join(this.patternsDir, `${name}.${ext}`);
      try {
        await fs.access(filePath);
        await this.loadYamlPattern(filePath);
        return;
      } catch {}
    }
    this.logger.warn({ name }, 'Pattern file not found');
  }
}
