import { Router } from 'express';
import { PatternEngine } from '../pattern-engine';
import { MetricsCollector } from '../metrics/metrics-collector';
import { Logger } from 'pino';

export function createPatternsRouter(
  patternEngine: PatternEngine,
  metrics: MetricsCollector,
  logger: Logger
): Router {
  const router = Router();

  // List all patterns
  router.get('/', (_req, res) => {
    const patterns = patternEngine.getPatterns();
    res.json({
      patterns: patterns.map(p => ({
        name: p.name,
        version: p.version,
        description: p.description,
        minAgents: p.minAgents,
        maxAgents: p.maxAgents,
        input: p.input,
        metadata: p.metadata
      }))
    });
  });

  // Get pattern details
  router.get('/:name', (req, res) => {
    const { name } = req.params;
    const patterns = patternEngine.getPatterns();
    const pattern = patterns.find(p => p.name === name);
    
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    
    res.json({
      name: pattern.name,
      version: pattern.version,
      description: pattern.description,
      minAgents: pattern.minAgents,
      maxAgents: pattern.maxAgents,
      input: pattern.input,
      agents: pattern.agents,
      metadata: pattern.metadata,
      script: pattern.script
    });
  });

  // Validate pattern input
  router.post('/:name/validate', (req, res) => {
    const { name } = req.params;
    const input = req.body;
    
    const patterns = patternEngine.getPatterns();
    const pattern = patterns.find(p => p.name === name);
    
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    
    // Basic validation - check required fields
    const errors: string[] = [];
    
    if (pattern.input?.required && !input) {
      errors.push('Input is required');
    }
    
    if (pattern.input?.schema) {
      // TODO: Add JSON schema validation
      logger.warn('JSON schema validation not yet implemented');
    }
    
    res.json({
      valid: errors.length === 0,
      errors
    });
  });

  // Execute pattern
  router.post('/:name/execute', async (req, res) => {
    const { name } = req.params;
    const endTimer = metrics.recordPatternStart(name);
    
    try {
      const input = req.body;
      const options = {
        timeout: req.query.timeout ? parseInt(req.query.timeout as string) : undefined
      };
      
      const result = await patternEngine.executePattern(name, input, options);
      
      // Record metrics
      endTimer();
      metrics.recordPatternResult(name, true, result.confidence);
      
      res.json({
        execution: {
          id: result.id,
          patternName: result.patternName,
          status: result.status,
          startTime: result.startTime,
          endTime: result.endTime,
          confidence: result.confidence,
          result: result.result,
          error: result.error,
          metrics: result.metrics,
          warnings: result.warnings
        }
      });
    } catch (error) {
      endTimer();
      metrics.recordPatternResult(name, false);
      metrics.recordPatternError(name, error instanceof Error ? error.constructor.name : 'UnknownError');
      
      logger.error({ error, pattern: name }, 'Pattern execution failed');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Pattern execution failed',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  // Reload patterns (development mode)
  router.post('/reload', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Pattern reload disabled in production' });
    }
    
    try {
      await patternEngine.reloadPatterns();
      const patterns = patternEngine.getPatterns();
      
      res.json({
        message: 'Patterns reloaded successfully',
        count: patterns.length,
        patterns: patterns.map(p => p.name)
      });
    } catch (error) {
      logger.error({ error }, 'Failed to reload patterns');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to reload patterns'
      });
    }
  });

  return router;
}