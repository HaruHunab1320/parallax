import { Pattern } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';
import * as yaml from 'js-yaml';
import { compileOrgPattern, OrgPattern } from '../org-patterns';

export class PatternLoader {
  private patterns: Map<string, Pattern> = new Map();
  private logger: Logger;

  constructor(private patternsDir: string, logger: Logger) {
    this.logger = logger;
  }

  async loadPatterns(): Promise<void> {
    try {
      const files = await fs.readdir(this.patternsDir);

      // Load both .prism and .yaml/.yml files
      const prismFiles = files.filter(f => f.endsWith('.prism'));
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      // Load Prism files directly
      for (const file of prismFiles) {
        const filePath = path.join(this.patternsDir, file);
        await this.loadPrismPattern(filePath);
      }

      // Compile and load YAML org-chart files
      for (const file of yamlFiles) {
        const filePath = path.join(this.patternsDir, file);
        await this.loadYamlPattern(filePath);
      }

      this.logger.info({
        total: this.patterns.size,
        prism: prismFiles.length,
        yaml: yamlFiles.length,
      }, 'Patterns loaded');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load patterns');
      throw error;
    }
  }

  /**
   * Load a YAML org-chart pattern by compiling it to Prism
   */
  private async loadYamlPattern(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const orgPattern = yaml.load(content) as OrgPattern;

      if (!orgPattern.name) {
        orgPattern.name = path.basename(filePath).replace(/\.ya?ml$/, '');
      }

      // Compile org-chart YAML to Prism
      const compiled = compileOrgPattern(orgPattern, { includeComments: true });

      this.logger.debug(
        { pattern: compiled.name, source: 'yaml' },
        'Compiled org-chart pattern to Prism'
      );

      // Create Pattern object from compiled result
      // Ensure input has required 'type' property for PatternInput
      const inputConfig = compiled.metadata.input;
      const patternInput = inputConfig && typeof inputConfig === 'object' && 'type' in inputConfig
        ? inputConfig as { type: string; required?: boolean; schema?: any }
        : { type: 'object', schema: inputConfig };

      const pattern: Pattern = {
        name: compiled.name,
        version: compiled.metadata.version,
        description: compiled.metadata.description,
        input: patternInput,
        agents: compiled.metadata.agents,
        minAgents: compiled.metadata.agents.minAgents,
        maxAgents: compiled.metadata.agents.maxAgents,
        script: compiled.script,
        workspace: orgPattern.metadata?.workspace || (orgPattern as any).workspace,
        metadata: {
          source: 'yaml',
          compiledFrom: filePath,
          orgChart: true,
        },
      };

      if (this.validatePattern(pattern)) {
        this.patterns.set(pattern.name, pattern);
        this.logger.debug({ pattern: pattern.name }, 'Org-chart pattern loaded');
      }
    } catch (error) {
      this.logger.error({ filePath, error }, 'Failed to load YAML pattern');
    }
  }

  /**
   * Load a Prism pattern file directly
   */
  private async loadPrismPattern(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const pattern = this.parsePrismPattern(content, filePath);

      if (this.validatePattern(pattern)) {
        this.patterns.set(pattern.name, pattern);
        this.logger.debug({ pattern: pattern.name, source: 'prism' }, 'Pattern loaded');
      }
    } catch (error) {
      this.logger.error({ filePath, error }, 'Failed to load pattern');
    }
  }

  private parsePrismPattern(content: string, filePath: string): Pattern {
    // Parse pattern metadata from comments
    const metadataMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    const metadata = metadataMatch ? this.parseMetadata(metadataMatch[1]) : {};

    // Extract the actual script by removing the metadata comment block
    const script = metadataMatch 
      ? content.replace(metadataMatch[0], '').trim()
      : content.trim();

    const name = metadata.name || path.basename(filePath, '.prism');
    
    return {
      name,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      input: metadata.input || { type: 'any' },
      agents: metadata.agents,
      minAgents: metadata.minAgents,
      maxAgents: metadata.maxAgents,
      script,
      metadata,
    };
  }

  private parseMetadata(metadataText: string): any {
    // Simple metadata parser for pattern files
    const lines = metadataText.split('\n');
    const metadata: any = {};

    for (const line of lines) {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (match) {
        const [, key, value] = match;
        try {
          // Try to parse as JSON
          metadata[key] = JSON.parse(value);
        } catch {
          // Otherwise store as string
          metadata[key] = value.trim();
        }
      }
    }

    return metadata;
  }

  private validatePattern(pattern: Pattern): boolean {
    if (!pattern.name) {
      this.logger.warn({ pattern }, 'Pattern missing name');
      return false;
    }

    if (!pattern.script) {
      this.logger.warn({ pattern: pattern.name }, 'Pattern missing script');
      return false;
    }

    return true;
  }

  getPattern(name: string): Pattern | undefined {
    return this.patterns.get(name);
  }

  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  async reloadPattern(name: string): Promise<void> {
    // Try .prism first, then .yaml, then .yml
    const prismPath = path.join(this.patternsDir, `${name}.prism`);
    const yamlPath = path.join(this.patternsDir, `${name}.yaml`);
    const ymlPath = path.join(this.patternsDir, `${name}.yml`);

    try {
      await fs.access(prismPath);
      await this.loadPrismPattern(prismPath);
      return;
    } catch {}

    try {
      await fs.access(yamlPath);
      await this.loadYamlPattern(yamlPath);
      return;
    } catch {}

    try {
      await fs.access(ymlPath);
      await this.loadYamlPattern(ymlPath);
      return;
    } catch {}

    this.logger.warn({ name }, 'Pattern file not found');
  }
}