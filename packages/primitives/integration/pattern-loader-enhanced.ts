/**
 * Enhanced Pattern Loader
 * 
 * Integrates the composition engine with Parallax's pattern loading system
 */

import { Pattern } from '@parallax/control-plane/pattern-engine/types';
import { PatternComposer } from '../composition/composer';
import { PatternAssembler } from '../composition/assembler';
import { PatternValidator } from '../validation/pattern-validator';
import { OrchestrationRequirements } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';

export class EnhancedPatternLoader {
  private patterns: Map<string, Pattern> = new Map();
  private composer: PatternComposer;
  private assembler: PatternAssembler;
  private validator: PatternValidator;
  private logger: Logger;

  constructor(
    private patternsDir: string, 
    logger: Logger
  ) {
    this.logger = logger;
    this.composer = new PatternComposer();
    this.assembler = new PatternAssembler();
    this.validator = new PatternValidator(logger);
  }

  /**
   * Load static patterns from disk and initialize composition engine
   */
  async loadPatterns(): Promise<void> {
    // First, load existing static patterns
    await this.loadStaticPatterns();
    
    // Initialize composed patterns cache
    this.logger.info({ 
      staticPatterns: this.patterns.size 
    }, 'Pattern loader initialized with composition engine');
  }

  /**
   * Load static .prism patterns from disk
   */
  private async loadStaticPatterns(): Promise<void> {
    try {
      const files = await fs.readdir(this.patternsDir);
      const patternFiles = files.filter(f => f.endsWith('.prism'));

      for (const file of patternFiles) {
        const filePath = path.join(this.patternsDir, file);
        await this.loadPattern(filePath);
      }

      this.logger.info({ count: this.patterns.size }, 'Static patterns loaded');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load static patterns');
    }
  }

  /**
   * Load a single pattern file
   */
  private async loadPattern(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const pattern = this.parsePattern(content, filePath);
      
      if (this.validateStaticPattern(pattern)) {
        this.patterns.set(pattern.name, pattern);
        this.logger.debug({ pattern: pattern.name }, 'Static pattern loaded');
      }
    } catch (error) {
      this.logger.error({ filePath, error }, 'Failed to load pattern');
    }
  }

  /**
   * Compose a pattern from requirements
   */
  async composePattern(requirements: OrchestrationRequirements): Promise<Pattern | null> {
    try {
      this.logger.info({ requirements }, 'Composing pattern from requirements');
      
      // Use composition engine
      const composedPattern = await this.composer.composePattern(requirements);
      const { pattern: executablePattern, validation } = await this.assembler.assembleWithValidation(composedPattern);
      
      if (!validation.isValid) {
        this.logger.error({ 
          errors: validation.errors,
          requirements 
        }, 'Composed pattern validation failed');
        return null;
      }

      // Log warnings and suggestions
      if (validation.warnings.length > 0) {
        this.logger.warn({ warnings: validation.warnings }, 'Pattern validation warnings');
      }
      if (validation.suggestions.length > 0) {
        this.logger.info({ suggestions: validation.suggestions }, 'Pattern optimization suggestions');
      }

      // Convert to Parallax Pattern format
      const pattern: Pattern = {
        name: composedPattern.name,
        version: '1.0.0',
        description: composedPattern.description,
        input: {
          type: 'object',
          schema: {
            type: 'object',
            properties: {
              data: { type: 'any' }
            }
          }
        },
        agents: {
          capabilities: this.extractRequiredCapabilities(composedPattern),
          minConfidence: requirements.minConfidence || 0.5
        },
        minAgents: this.calculateMinAgents(composedPattern),
        maxAgents: this.calculateMaxAgents(composedPattern),
        script: executablePattern.code,
        metadata: {
          ...executablePattern.metadata,
          composed: true,
          primitives: executablePattern.primitives,
          complexity: composedPattern.complexity,
          estimatedConfidence: executablePattern.confidence
        }
      };

      // Cache the composed pattern
      this.patterns.set(pattern.name, pattern);
      
      this.logger.info({ 
        patternName: pattern.name,
        primitives: executablePattern.primitives 
      }, 'Pattern successfully composed and cached');

      return pattern;

    } catch (error) {
      this.logger.error({ error, requirements }, 'Failed to compose pattern');
      return null;
    }
  }

  /**
   * Get a pattern by name (static or composed)
   */
  getPattern(name: string): Pattern | undefined {
    return this.patterns.get(name);
  }

  /**
   * Get all loaded patterns
   */
  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Parse pattern metadata from file content
   */
  private parsePattern(content: string, filePath: string): Pattern {
    // Parse pattern metadata from comments
    const metadataMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    const metadata = metadataMatch ? this.parseMetadata(metadataMatch[1]) : {};

    // Extract pattern name from filename
    const name = path.basename(filePath, '.prism');

    return {
      name,
      version: metadata.version || '1.0.0',
      description: metadata.description || 'No description',
      input: metadata.input || { type: 'any' },
      agents: metadata.agents,
      minAgents: metadata.minAgents,
      maxAgents: metadata.maxAgents,
      script: content,
      metadata
    };
  }

  /**
   * Parse metadata from comment block
   */
  private parseMetadata(commentBlock: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    const lines = commentBlock.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*\*?\s*@(\w+)\s+(.+)$/);
      if (match) {
        const [, key, value] = match;
        try {
          // Try to parse as JSON first
          metadata[key] = JSON.parse(value);
        } catch {
          // Otherwise treat as string
          metadata[key] = value.trim();
        }
      }
    }

    return metadata;
  }

  /**
   * Validate a static pattern
   */
  private validateStaticPattern(pattern: Pattern): boolean {
    if (!pattern.name || !pattern.script) {
      this.logger.warn({ pattern }, 'Invalid pattern: missing name or script');
      return false;
    }
    return true;
  }

  /**
   * Extract required capabilities from composed pattern
   */
  private extractRequiredCapabilities(pattern: any): string[] {
    const capabilities = new Set<string>();

    // Extract from pattern metadata
    if (pattern.metadata?.goal) {
      const goal = pattern.metadata.goal.toLowerCase();
      if (goal.includes('code')) capabilities.add('code-analysis');
      if (goal.includes('security')) capabilities.add('security-analysis');
      if (goal.includes('data')) capabilities.add('data-processing');
      if (goal.includes('review')) capabilities.add('review');
    }

    // Extract from primitives used
    if (pattern.primitives.includes('consensus')) capabilities.add('analysis');
    if (pattern.primitives.includes('voting')) capabilities.add('decision-making');

    return Array.from(capabilities);
  }

  /**
   * Calculate minimum agents needed
   */
  private calculateMinAgents(pattern: any): number {
    // Parallel patterns need multiple agents
    if (pattern.primitives.includes('parallel')) return 2;
    if (pattern.primitives.includes('consensus')) return 3;
    if (pattern.primitives.includes('voting')) return 3;
    if (pattern.primitives.includes('quorum')) return 3;
    return 1;
  }

  /**
   * Calculate maximum agents allowed
   */
  private calculateMaxAgents(pattern: any): number {
    // Some patterns benefit from limited agents
    if (pattern.primitives.includes('sequential')) return 5;
    if (pattern.primitives.includes('race')) return 10;
    return 20; // Default max
  }
}