/**
 * Database Pattern Service
 *
 * Handles database-backed pattern storage for enterprise deployments.
 * Provides CRUD operations and versioning support.
 */

import { Logger } from 'pino';
import { PatternRepository } from '../db/repositories/pattern.repository';
import { Pattern } from './types';
import { Pattern as PrismaPattern, PatternVersion } from '@prisma/client';

export interface SavePatternOptions {
  overwrite?: boolean;
  createVersion?: boolean;
  author?: string;
}

export interface PatternWithSource extends Pattern {
  id?: string;
  source: 'database';
  createdAt?: Date;
  updatedAt?: Date;
}

export class DatabasePatternService {
  private logger: Logger;
  private cache: Map<string, PatternWithSource> = new Map();
  private initialized = false;

  constructor(
    private repository: PatternRepository,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'DatabasePatternService' });
  }

  /**
   * Initialize the service by loading all patterns from the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const patterns = await this.repository.findAll();
      for (const pattern of patterns) {
        const converted = this.fromPrisma(pattern);
        this.cache.set(converted.name, converted);
      }
      this.initialized = true;
      this.logger.info(
        { count: this.cache.size },
        'Database patterns loaded'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to load database patterns');
      throw error;
    }
  }

  /**
   * Get all patterns from the database
   */
  async getAll(): Promise<PatternWithSource[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return Array.from(this.cache.values());
  }

  /**
   * Get a pattern by name
   */
  async getByName(name: string): Promise<PatternWithSource | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.cache.get(name) || null;
  }

  /**
   * Save a pattern to the database
   */
  async save(
    pattern: Pattern,
    options: SavePatternOptions = {}
  ): Promise<PatternWithSource> {
    const { overwrite = false, createVersion = true, author } = options;

    const existing = await this.repository.findByName(pattern.name);

    if (existing && !overwrite) {
      throw new Error(`Pattern '${pattern.name}' already exists`);
    }

    let saved: PrismaPattern;

    if (existing) {
      // Create version before updating if requested
      if (createVersion) {
        await this.repository.createVersion(existing.id, {
          script: existing.script,
          metadata: existing.metadata,
          createdBy: author,
        });
      }

      // Update existing pattern
      saved = await this.repository.update(existing.id, {
        version: pattern.version,
        description: pattern.description,
        script: pattern.script,
        metadata: pattern.metadata || {},
        input: (pattern.input || {}) as any,
        minAgents: pattern.minAgents,
        maxAgents: pattern.maxAgents,
      });

      this.logger.info(
        { pattern: pattern.name, versioned: createVersion },
        'Pattern updated'
      );
    } else {
      // Create new pattern
      saved = await this.repository.create({
        name: pattern.name,
        version: pattern.version || '1.0.0',
        description: pattern.description || '',
        script: pattern.script,
        metadata: pattern.metadata || {},
        input: (pattern.input || {}) as any,
        minAgents: pattern.minAgents,
        maxAgents: pattern.maxAgents,
      });

      this.logger.info({ pattern: pattern.name }, 'Pattern created');
    }

    const result = this.fromPrisma(saved);
    this.cache.set(result.name, result);
    return result;
  }

  /**
   * Delete a pattern from the database
   */
  async delete(name: string): Promise<void> {
    const existing = await this.repository.findByName(name);
    if (!existing) {
      throw new Error(`Pattern '${name}' not found`);
    }

    await this.repository.delete(existing.id);
    this.cache.delete(name);
    this.logger.info({ pattern: name }, 'Pattern deleted');
  }

  /**
   * Get version history for a pattern
   */
  async getVersions(name: string): Promise<PatternVersion[]> {
    const existing = await this.repository.findByName(name);
    if (!existing) {
      throw new Error(`Pattern '${name}' not found`);
    }

    return this.repository.getVersions(existing.id);
  }

  /**
   * Restore a specific version of a pattern
   */
  async restoreVersion(name: string, version: string): Promise<PatternWithSource> {
    const existing = await this.repository.findByName(name);
    if (!existing) {
      throw new Error(`Pattern '${name}' not found`);
    }

    const versionRecord = await this.repository.getVersion(existing.id, version);
    if (!versionRecord) {
      throw new Error(`Version '${version}' not found for pattern '${name}'`);
    }

    // Create a version of current state before restoring
    await this.repository.createVersion(existing.id, {
      script: existing.script,
      metadata: existing.metadata,
      createdBy: 'system:restore',
    });

    // Update pattern with version content
    const saved = await this.repository.update(existing.id, {
      script: versionRecord.script,
      metadata: versionRecord.metadata || {},
      version: this.incrementVersion(existing.version),
    });

    this.logger.info(
      { pattern: name, restoredVersion: version },
      'Pattern version restored'
    );

    const result = this.fromPrisma(saved);
    this.cache.set(result.name, result);
    return result;
  }

  /**
   * Reload all patterns from the database
   */
  async reload(): Promise<void> {
    this.cache.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Convert Prisma Pattern to internal Pattern type
   */
  private fromPrisma(prismaPattern: PrismaPattern): PatternWithSource {
    return {
      id: prismaPattern.id,
      name: prismaPattern.name,
      version: prismaPattern.version,
      description: prismaPattern.description,
      script: prismaPattern.script,
      input: (prismaPattern.input as any) || { type: 'any' },
      agents: (prismaPattern.metadata as any)?.agents,
      minAgents: prismaPattern.minAgents || undefined,
      maxAgents: prismaPattern.maxAgents || undefined,
      metadata: (prismaPattern.metadata as any) || {},
      source: 'database',
      createdAt: prismaPattern.createdAt,
      updatedAt: prismaPattern.updatedAt,
    };
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.1';
    }
    parts[2] += 1;
    return parts.join('.');
  }
}
