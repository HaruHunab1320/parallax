import { Pattern } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';

export class PatternLoader {
  private patterns: Map<string, Pattern> = new Map();
  private logger: Logger;

  constructor(private patternsDir: string, logger: Logger) {
    this.logger = logger;
  }

  async loadPatterns(): Promise<void> {
    try {
      const files = await fs.readdir(this.patternsDir);
      const patternFiles = files.filter(f => f.endsWith('.prism'));

      for (const file of patternFiles) {
        const filePath = path.join(this.patternsDir, file);
        await this.loadPattern(filePath);
      }

      this.logger.info({ count: this.patterns.size }, 'Patterns loaded');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load patterns');
      throw error;
    }
  }

  private async loadPattern(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const pattern = this.parsePattern(content, filePath);
      
      if (this.validatePattern(pattern)) {
        this.patterns.set(pattern.name, pattern);
        this.logger.debug({ pattern: pattern.name }, 'Pattern loaded');
      }
    } catch (error) {
      this.logger.error({ filePath, error }, 'Failed to load pattern');
    }
  }

  private parsePattern(content: string, filePath: string): Pattern {
    // Parse pattern metadata from comments
    const metadataMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    const metadata = metadataMatch ? this.parseMetadata(metadataMatch[1]) : {};

    const name = path.basename(filePath, '.prism');
    
    return {
      name,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      input: metadata.input || { type: 'any' },
      agents: metadata.agents,
      minAgents: metadata.minAgents,
      maxAgents: metadata.maxAgents,
      script: content,
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
    const filePath = path.join(this.patternsDir, `${name}.prism`);
    await this.loadPattern(filePath);
  }
}