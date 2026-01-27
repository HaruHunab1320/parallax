import { Router, Request, Response, NextFunction } from 'express';
import { PatternEngine } from '../pattern-engine';
import { MetricsCollector } from '../metrics/metrics-collector';
import { Logger } from 'pino';
import { LicenseEnforcer } from '../licensing/license-enforcer';

export function createPatternsRouter(
  patternEngine: PatternEngine,
  metrics: MetricsCollector,
  logger: Logger,
  licenseEnforcer?: LicenseEnforcer
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
    
    try {
      const startTime = Date.now();
      
      // Execute pattern
      const result = await patternEngine.executePattern(name, input, options);
      
      const duration = Date.now() - startTime;
      
      // Update metrics
      metrics.recordApiCall('patterns', 'execute', 200);
      metrics.recordPatternExecution(name, duration, true);
      
      return res.json({ 
        execution: result,
        duration
      });
    } catch (error) {
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