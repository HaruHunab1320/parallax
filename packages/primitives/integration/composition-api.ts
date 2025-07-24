/**
 * Pattern Composition API
 * 
 * REST API endpoints for pattern composition
 */

import { Router, Request, Response } from 'express';
import { PatternComposer } from '../composition/composer';
import { PatternAssembler } from '../composition/assembler';
import { PatternValidator } from '../validation/pattern-validator';
import { OrchestrationRequirements } from '../types';
import { Logger } from 'pino';

export function createCompositionRouter(logger: Logger): Router {
  const router = Router();
  const composer = new PatternComposer();
  const assembler = new PatternAssembler();
  const validator = new PatternValidator(logger);

  /**
   * POST /api/patterns/compose
   * Compose a new pattern from requirements
   */
  router.post('/compose', async (req: Request, res: Response) => {
    try {
      const requirements: OrchestrationRequirements = req.body;

      // Validate requirements
      if (!requirements.goal) {
        return res.status(400).json({
          error: 'Missing required field: goal'
        });
      }

      logger.info({ requirements }, 'Received pattern composition request');

      // Compose the pattern
      const composedPattern = await composer.composePattern(requirements);
      
      // Assemble with validation
      const { pattern, validation } = await assembler.assembleWithValidation(composedPattern);

      // Return the result
      res.json({
        success: validation.isValid,
        pattern: {
          id: composedPattern.id,
          name: composedPattern.name,
          description: composedPattern.description,
          primitives: pattern.primitives,
          confidence: pattern.confidence,
          complexity: composedPattern.complexity,
          code: pattern.code
        },
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
          suggestions: validation.suggestions
        },
        metadata: {
          composedAt: new Date().toISOString(),
          requirements: requirements
        }
      });

    } catch (error) {
      logger.error({ error }, 'Pattern composition failed');
      res.status(500).json({
        error: 'Pattern composition failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/patterns/validate
   * Validate a pattern without saving
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const { code, metadata } = req.body;

      if (!code) {
        return res.status(400).json({
          error: 'Missing required field: code'
        });
      }

      const validation = await validator.validatePattern({
        code,
        primitives: [],
        confidence: 0.5,
        metadata
      });

      res.json({
        validation
      });

    } catch (error) {
      logger.error({ error }, 'Pattern validation failed');
      res.status(500).json({
        error: 'Pattern validation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/patterns/analyze
   * Analyze requirements and suggest primitives
   */
  router.post('/analyze', async (req: Request, res: Response) => {
    try {
      const requirements: OrchestrationRequirements = req.body;

      if (!requirements.goal) {
        return res.status(400).json({
          error: 'Missing required field: goal'
        });
      }

      // Use composer to analyze requirements
      const analysis = await composer['analyzeRequirements'](requirements);
      const selectedPrimitives = composer['selectPrimitives'](analysis);

      res.json({
        analysis: {
          needsParallelism: analysis.needsParallelism,
          needsConsensus: analysis.needsConsensus,
          needsRetry: analysis.needsRetry,
          needsFallback: analysis.needsFallback,
          confidenceRequirement: analysis.confidenceRequirement,
          complexityScore: analysis.complexityScore
        },
        suggestedPrimitives: selectedPrimitives.map(p => ({
          name: p.name,
          type: p.type,
          description: p.description
        })),
        recommendations: generateRecommendations(analysis)
      });

    } catch (error) {
      logger.error({ error }, 'Requirements analysis failed');
      res.status(500).json({
        error: 'Requirements analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/patterns/primitives
   * List all available primitives
   */
  router.get('/primitives', async (req: Request, res: Response) => {
    try {
      const primitiveCategories = {
        execution: ['parallel', 'sequential', 'race', 'batch'],
        aggregation: ['consensus', 'voting', 'merge', 'reduce'],
        confidence: ['threshold', 'transform'],
        control: ['retry', 'fallback', 'escalate', 'circuit', 'timeout', 'cache'],
        coordination: ['delegate', 'prioritize', 'quorum', 'synchronize'],
        transformation: ['map', 'partition', 'sample'],
        workflow: ['pipeline', 'dependency'],
        temporal: ['schedule'],
        resource: ['pool'],
        transaction: ['saga'],
        event: ['pubsub', 'stream'],
        goal: ['plan']
      };

      res.json({
        primitives: primitiveCategories,
        total: Object.values(primitiveCategories).flat().length
      });

    } catch (error) {
      logger.error({ error }, 'Failed to list primitives');
      res.status(500).json({
        error: 'Failed to list primitives'
      });
    }
  });

  /**
   * POST /api/patterns/optimize
   * Optimize an existing pattern
   */
  router.post('/optimize', async (req: Request, res: Response) => {
    try {
      const { pattern } = req.body;

      if (!pattern || !pattern.code) {
        return res.status(400).json({
          error: 'Missing required field: pattern.code'
        });
      }

      // Validate and get suggestions
      const validation = await validator.validatePattern(pattern);

      // Generate optimized version (placeholder for now)
      const optimizations = {
        original: pattern,
        suggestions: validation.suggestions,
        warnings: validation.warnings,
        possibleImprovements: generateOptimizations(pattern, validation)
      };

      res.json(optimizations);

    } catch (error) {
      logger.error({ error }, 'Pattern optimization failed');
      res.status(500).json({
        error: 'Pattern optimization failed'
      });
    }
  });

  return router;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(analysis: any): string[] {
  const recommendations: string[] = [];

  if (analysis.needsParallelism && analysis.needsConsensus) {
    recommendations.push('Use parallel-consensus pattern for distributed agreement');
  }

  if (analysis.needsRetry && !analysis.needsFallback) {
    recommendations.push('Consider adding fallback for better reliability');
  }

  if (analysis.confidenceRequirement > 0.8) {
    recommendations.push('High confidence requirement - consider multiple validation stages');
  }

  if (analysis.complexityScore > 5) {
    recommendations.push('Complex pattern - consider breaking into sub-patterns');
  }

  return recommendations;
}

/**
 * Generate optimization suggestions
 */
function generateOptimizations(pattern: any, validation: any): string[] {
  const optimizations: string[] = [];

  if (!pattern.code.includes('~>')) {
    optimizations.push('Add confidence operators to track confidence propagation');
  }

  if (pattern.primitives?.includes('sequential')) {
    optimizations.push('Evaluate if tasks can be parallelized for better performance');
  }

  if (pattern.primitives?.includes('retry') && !pattern.primitives?.includes('circuit')) {
    optimizations.push('Add circuit breaker to prevent cascading failures');
  }

  return optimizations;
}