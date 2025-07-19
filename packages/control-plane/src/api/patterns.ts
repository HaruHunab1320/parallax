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
  router.get('/:name', (req, res) => {
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
  router.post('/:name/validate', async (req, res) => {
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
  router.post('/:name/execute', async (req, res) => {
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
  router.get('/:name/metrics', async (_req, res) => {
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

  return router;
}