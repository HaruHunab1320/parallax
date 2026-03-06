import { Router, Request, Response, NextFunction } from 'express';
import { PatternEngine } from '../pattern-engine';
import { MetricsCollector } from '../metrics/metrics-collector';
import { Logger } from 'pino';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { DatabaseService } from '../db/database.service';
import { createExecutionInDb, updateExecutionInDb } from '../pattern-engine/pattern-engine-db';
import { PatternLoader } from '../pattern-engine/pattern-loader';
import { compileOrgPattern, OrgPattern } from '../org-patterns';
import * as yaml from 'js-yaml';
import * as path from 'path';

export function createPatternsRouter(
  patternEngine: PatternEngine,
  metrics: MetricsCollector,
  logger: Logger,
  licenseEnforcer?: LicenseEnforcer,
  database?: DatabaseService
): Router {
  const router = Router();

  // Middleware to check for pattern_management license feature
  const requirePatternManagement = (req: Request, res: Response, next: NextFunction): void => {
    if (!licenseEnforcer?.hasFeature('pattern_management')) {
      metrics.recordApiCall('patterns', 'unauthorized', 403);
      res.status(403).json({
        error: 'Pattern management requires Parallax Enterprise',
        upgradeUrl: 'https://parallax.ai/enterprise',
      });
      return;
    }
    next();
  };

  // List all patterns
  router.get('/', (_req: any, res: any) => {
    try {
      const patterns = patternEngine.listPatterns();
      
      // Update metrics
      metrics.recordApiCall('patterns', 'list', 200);
      
      return res.json({ 
        patterns,
        count: patterns.length
      });
    } catch (error) {
      metrics.recordApiCall('patterns', 'list', 500);
      logger.error({ error }, 'Failed to list patterns');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list patterns'
      });
    }
  });

  // Get pattern details
  router.get('/:name', (req: any, res: any) => {
    const { name } = req.params;
    
    try {
      const pattern = patternEngine.getPattern(name);
      
      if (!pattern) {
        metrics.recordApiCall('patterns', 'get', 404);
        return res.status(404).json({ error: 'Pattern not found' });
      }
      
      metrics.recordApiCall('patterns', 'get', 200);
      return res.json(pattern);
    } catch (error) {
      metrics.recordApiCall('patterns', 'get', 500);
      logger.error({ error, patternName: name }, 'Failed to get pattern');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get pattern'
      });
    }
  });

  // Validate pattern
  router.post('/:name/validate', async (req: any, res: any) => {
    const { name } = req.params;
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({ 
        error: 'Missing required field: input' 
      });
    }
    
    try {
      const pattern = patternEngine.getPattern(name);
      
      if (!pattern) {
        return res.status(404).json({ error: 'Pattern not found' });
      }
      
      // Basic validation - check if input matches expected structure
      const validation = {
        valid: true,
        errors: [] as string[]
      };
      
      // Check required fields if pattern has input schema
      if (pattern.metadata?.inputSchema) {
        const schema = pattern.metadata.inputSchema;
        const required = schema.required || [];
        
        for (const field of required) {
          if (!(field in input)) {
            validation.valid = false;
            validation.errors.push(`Missing required field: ${field}`);
          }
        }
      }
      
      return res.json(validation);
    } catch (error) {
      logger.error({ error, patternName: name }, 'Failed to validate pattern');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to validate pattern'
      });
    }
  });

  // Execute pattern (sync endpoint)
  router.post('/:name/execute', async (req: any, res: any) => {
    const { name } = req.params;
    const { input, options } = req.body;

    if (!input) {
      return res.status(400).json({
        error: 'Missing required field: input'
      });
    }

    let dbExecutionId: string | undefined;

    try {
      const startTime = Date.now();

      // Create database record before execution
      if (database) {
        try {
          dbExecutionId = await createExecutionInDb(database, name, input, options);
        } catch (dbError) {
          logger.warn({ error: dbError }, 'Failed to create execution record in database');
        }
      }

      // Execute pattern
      const result = await patternEngine.executePattern(name, input, options);

      const duration = Date.now() - startTime;

      // Persist result to database
      if (database && dbExecutionId) {
        try {
          await updateExecutionInDb(database, dbExecutionId, {
            status: 'completed',
            result: result.result,
            confidence: result.metrics?.averageConfidence ?? result.confidence ?? 0,
            durationMs: duration,
            agentCount: result.metrics?.agentsUsed ?? 0,
          });
        } catch (dbError) {
          logger.warn({ error: dbError }, 'Failed to update execution record in database');
        }
      }

      // Update metrics
      metrics.recordApiCall('patterns', 'execute', 200);
      metrics.recordPatternExecution(name, duration, true);

      return res.json({
        execution: { ...result, id: dbExecutionId || result.id },
        duration
      });
    } catch (error) {
      // Persist failure to database
      if (database && dbExecutionId) {
        try {
          await updateExecutionInDb(database, dbExecutionId, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        } catch (dbError) {
          logger.warn({ error: dbError }, 'Failed to update failed execution in database');
        }
      }

      metrics.recordApiCall('patterns', 'execute', 500);
      metrics.recordPatternExecution(name, 0, false);

      logger.error({ error, patternName: name }, 'Failed to execute pattern');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute pattern'
      });
    }
  });

  // Get pattern metrics
  router.get('/:name/metrics', async (_req: any, res: any) => {
    const { name } = _req.params;

    try {
      const allMetrics = patternEngine.getMetrics();
      const patternMetrics = allMetrics.filter(m =>
        m.pattern === name || m.patternName === name
      );

      if (patternMetrics.length === 0) {
        return res.status(404).json({ error: 'No metrics found for pattern' });
      }

      // Calculate aggregate statistics
      const stats = {
        totalExecutions: patternMetrics.length,
        avgDuration: patternMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / patternMetrics.length,
        avgConfidence: patternMetrics.reduce((sum, m) => sum + (m.confidence || 0), 0) / patternMetrics.length,
        successRate: patternMetrics.filter(m => m.success).length / patternMetrics.length,
        recentExecutions: patternMetrics.slice(-10).reverse()
      };

      return res.json({
        pattern: name,
        stats,
        metrics: patternMetrics
      });
    } catch (error) {
      logger.error({ error, patternName: name }, 'Failed to get pattern metrics');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get metrics'
      });
    }
  });

  // ============================================
  // Enterprise Pattern Management Endpoints
  // ============================================

  // Create new pattern (Enterprise)
  router.post('/', requirePatternManagement, async (req: any, res: any) => {
    const { name, script, version, description, input, minAgents, maxAgents, metadata } = req.body;

    if (!name || !script) {
      metrics.recordApiCall('patterns', 'create', 400);
      return res.status(400).json({
        error: 'Missing required fields: name and script are required',
      });
    }

    try {
      const pattern = await patternEngine.savePattern(
        {
          name,
          script,
          version: version || '1.0.0',
          description: description || '',
          input: input || { type: 'any' },
          minAgents,
          maxAgents,
          metadata,
        },
        { overwrite: false }
      );

      metrics.recordApiCall('patterns', 'create', 201);
      logger.info({ patternName: name }, 'Pattern created via API');
      return res.status(201).json(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create pattern';

      if (message.includes('already exists')) {
        metrics.recordApiCall('patterns', 'create', 409);
        return res.status(409).json({ error: message });
      }

      metrics.recordApiCall('patterns', 'create', 500);
      logger.error({ error, patternName: name }, 'Failed to create pattern');
      return res.status(500).json({ error: message });
    }
  });

  // Update existing pattern (Enterprise)
  router.put('/:name', requirePatternManagement, async (req: any, res: any) => {
    const { name } = req.params;
    const updates = req.body;

    try {
      const existing = patternEngine.getPattern(name);
      if (!existing) {
        metrics.recordApiCall('patterns', 'update', 404);
        return res.status(404).json({ error: 'Pattern not found' });
      }

      // Check if it's a file-based pattern
      const patternWithSource = existing as any;
      if (patternWithSource.source === 'file' && !patternEngine.hasDatabasePatterns()) {
        metrics.recordApiCall('patterns', 'update', 403);
        return res.status(403).json({
          error: 'Cannot update file-based patterns. Edit the .prism file directly or enable database storage.',
        });
      }

      const pattern = await patternEngine.savePattern(
        {
          ...existing,
          ...updates,
          name, // Ensure name cannot be changed
        },
        { overwrite: true }
      );

      metrics.recordApiCall('patterns', 'update', 200);
      logger.info({ patternName: name }, 'Pattern updated via API');
      return res.json(pattern);
    } catch (error) {
      metrics.recordApiCall('patterns', 'update', 500);
      logger.error({ error, patternName: name }, 'Failed to update pattern');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update pattern',
      });
    }
  });

  // Delete pattern (Enterprise)
  router.delete('/:name', requirePatternManagement, async (req: any, res: any) => {
    const { name } = req.params;

    try {
      await patternEngine.deletePattern(name);
      metrics.recordApiCall('patterns', 'delete', 204);
      logger.info({ patternName: name }, 'Pattern deleted via API');
      return res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete pattern';

      if (message.includes('not found')) {
        metrics.recordApiCall('patterns', 'delete', 404);
        return res.status(404).json({ error: message });
      }

      if (message.includes('file-based')) {
        metrics.recordApiCall('patterns', 'delete', 403);
        return res.status(403).json({ error: message });
      }

      metrics.recordApiCall('patterns', 'delete', 500);
      logger.error({ error, patternName: name }, 'Failed to delete pattern');
      return res.status(500).json({ error: message });
    }
  });

  // Upload pattern file (Enterprise)
  router.post('/upload', requirePatternManagement, async (req: any, res: any) => {
    const { filename, content, overwrite } = req.body;

    if (!filename || !content) {
      metrics.recordApiCall('patterns', 'upload', 400);
      return res.status(400).json({
        error: 'Missing required fields: filename and content are required',
      });
    }

    try {
      const result = await parseAndSavePattern(filename, content, overwrite ?? false);
      metrics.recordApiCall('patterns', 'upload', 201);
      logger.info({ filename, patternName: result.pattern.name }, 'Pattern uploaded via API');
      return res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload pattern';

      if (message.includes('already exists')) {
        metrics.recordApiCall('patterns', 'upload', 409);
        return res.status(409).json({ error: message });
      }

      metrics.recordApiCall('patterns', 'upload', 500);
      logger.error({ error, filename }, 'Failed to upload pattern');
      return res.status(500).json({ error: message });
    }
  });

  // Batch upload pattern files (Enterprise)
  router.post('/upload/batch', requirePatternManagement, async (req: any, res: any) => {
    const { files, overwrite } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      metrics.recordApiCall('patterns', 'upload-batch', 400);
      return res.status(400).json({
        error: 'Missing required field: files must be a non-empty array',
      });
    }

    const results: Array<{ filename: string; success: boolean; pattern?: any; error?: string }> = [];

    for (const file of files) {
      if (!file.filename || !file.content) {
        results.push({ filename: file.filename || 'unknown', success: false, error: 'Missing filename or content' });
        continue;
      }

      try {
        const result = await parseAndSavePattern(file.filename, file.content, overwrite ?? false);
        results.push({ filename: file.filename, success: true, pattern: result.pattern });
      } catch (error) {
        results.push({
          filename: file.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to upload pattern',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    metrics.recordApiCall('patterns', 'upload-batch', 200);
    logger.info({ total: files.length, success: successCount }, 'Batch pattern upload completed');
    return res.json({ results });
  });

  async function parseAndSavePattern(
    filename: string,
    content: string,
    overwrite: boolean
  ): Promise<{ pattern: any; compiled?: boolean }> {
    const ext = path.extname(filename).toLowerCase();

    if (ext === '.prism') {
      const fallbackName = path.basename(filename, '.prism');
      const parsed = PatternLoader.parsePrismPattern(content, fallbackName);
      const pattern = await patternEngine.savePattern(parsed, { overwrite });
      return { pattern };
    }

    if (ext === '.yaml' || ext === '.yml') {
      const orgPattern = yaml.load(content) as OrgPattern;
      if (!orgPattern.name) {
        orgPattern.name = path.basename(filename).replace(/\.ya?ml$/, '');
      }

      const compiled = compileOrgPattern(orgPattern, { includeComments: true });

      const inputConfig = compiled.metadata.input;
      const patternInput = inputConfig && typeof inputConfig === 'object' && 'type' in inputConfig
        ? inputConfig as { type: string; required?: boolean; schema?: any }
        : { type: 'object', schema: inputConfig };

      const patternData = {
        name: compiled.name,
        version: compiled.metadata.version,
        description: compiled.metadata.description,
        input: patternInput,
        agents: compiled.metadata.agents,
        minAgents: compiled.metadata.agents.minAgents,
        maxAgents: compiled.metadata.agents.maxAgents,
        script: compiled.script,
        metadata: {
          source: 'yaml',
          orgChart: true,
        },
      };

      const pattern = await patternEngine.savePattern(patternData, { overwrite });
      return { pattern, compiled: true };
    }

    throw new Error(`Unsupported file extension: ${ext}. Use .prism, .yaml, or .yml`);
  }

  // Get pattern versions (Enterprise)
  router.get('/:name/versions', requirePatternManagement, async (req: any, res: any) => {
    const { name } = req.params;

    try {
      const existing = patternEngine.getPattern(name);
      if (!existing) {
        metrics.recordApiCall('patterns', 'versions', 404);
        return res.status(404).json({ error: 'Pattern not found' });
      }

      const versions = await patternEngine.getPatternVersions(name);

      metrics.recordApiCall('patterns', 'versions', 200);
      return res.json({ pattern: name, versions });
    } catch (error) {
      metrics.recordApiCall('patterns', 'versions', 500);
      logger.error({ error, patternName: name }, 'Failed to get pattern versions');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get versions',
      });
    }
  });

  return router;
}