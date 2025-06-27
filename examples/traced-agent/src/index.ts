/**
 * Example agent with OpenTelemetry tracing
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { 
  initializeTracing, 
  getTracingConfig
} from '@parallax/telemetry';
import pino from 'pino';

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Define a traced recommendation agent
class TracedRecommendationAgent extends ParallaxAgent {
  constructor() {
    super(
      'recommender-1',
      'Traced Recommendation Engine',
      ['recommendation', 'personalization', 'analytics'],
      {
        expertise: 0.85,
        capabilityScores: {
          'recommendation': 0.9,
          'personalization': 0.85,
          'analytics': 0.8
        },
        version: '1.0.0'
      }
    );
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    logger.info({ task, hasData: !!data }, 'Analyzing recommendation request');
    
    // Simulate different recommendation scenarios
    if (task.includes('product')) {
      return this.productRecommendation(data);
    } else if (task.includes('content')) {
      return this.contentRecommendation(data);
    } else if (task.includes('user')) {
      return this.userSimilarity(data);
    } else {
      return this.generalRecommendation(task, data);
    }
  }
  
  private async productRecommendation(data: any): Promise<[any, number]> {
    // Simulate processing time
    await this.simulateProcessing(100, 300);
    
    const userId = data?.userId || 'anonymous';
    const category = data?.category || 'general';
    const confidence = 0.75 + Math.random() * 0.2;
    
    const recommendations = [
      { 
        productId: 'PROD-001', 
        name: 'Premium Widget', 
        score: 0.92,
        reason: 'Based on purchase history'
      },
      { 
        productId: 'PROD-023', 
        name: 'Deluxe Gadget', 
        score: 0.87,
        reason: 'Popular in your category'
      },
      { 
        productId: 'PROD-045', 
        name: 'Essential Tool', 
        score: 0.83,
        reason: 'Frequently bought together'
      }
    ];
    
    return [{
      userId,
      category,
      recommendations,
      generated_at: new Date().toISOString(),
      algorithm: 'collaborative_filtering',
      confidence_factors: {
        data_quality: 0.9,
        user_history: 0.8,
        model_accuracy: 0.85
      }
    }, confidence];
  }
  
  private async contentRecommendation(data: any): Promise<[any, number]> {
    await this.simulateProcessing(150, 250);
    
    const interests = data?.interests || ['technology', 'science'];
    const confidence = 0.8 + Math.random() * 0.15;
    
    const articles = [
      {
        id: 'ART-101',
        title: 'The Future of AI',
        relevance: 0.95,
        topics: ['AI', 'technology', 'future']
      },
      {
        id: 'ART-205',
        title: 'Quantum Computing Breakthrough',
        relevance: 0.88,
        topics: ['quantum', 'science', 'computing']
      }
    ];
    
    return [{
      content_type: 'articles',
      recommendations: articles,
      personalization_score: 0.87,
      interests_matched: interests,
      diversity_score: 0.72
    }, confidence];
  }
  
  private async userSimilarity(data: any): Promise<[any, number]> {
    await this.simulateProcessing(200, 400);
    
    const userId = data?.userId || 'user-001';
    const confidence = 0.7 + Math.random() * 0.25;
    
    return [{
      userId,
      similar_users: [
        { userId: 'user-042', similarity: 0.89 },
        { userId: 'user-156', similarity: 0.84 },
        { userId: 'user-289', similarity: 0.81 }
      ],
      clustering_method: 'k-means',
      features_analyzed: ['purchase_history', 'browsing_patterns', 'ratings']
    }, confidence];
  }
  
  private async generalRecommendation(task: string, data: any): Promise<[any, number]> {
    await this.simulateProcessing(50, 150);
    
    const confidence = 0.6 + Math.random() * 0.3;
    
    return [{
      task,
      status: 'completed',
      recommendations: ['Option A', 'Option B', 'Option C'],
      metadata: {
        processed_at: new Date().toISOString(),
        data_points: data ? Object.keys(data).length : 0
      }
    }, confidence];
  }
  
  private async simulateProcessing(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Main function
async function main() {
  // Initialize tracing
  const tracingConfig = getTracingConfig('recommendation-agent');
  await initializeTracing(tracingConfig, logger);
  
  const agent = new TracedRecommendationAgent();
  
  // Get configuration
  const port = parseInt(process.env.AGENT_PORT || '50062');
  
  logger.info({
    agentId: agent.id,
    tracing: tracingConfig.exporterType !== 'none',
    port
  }, 'Starting traced recommendation agent');
  
  try {
    const actualPort = await serveAgent(agent, port);
    
    logger.info(`
===========================================
Traced Recommendation Agent Started
===========================================
ID: ${agent.id}
Port: ${actualPort}
Tracing: ${tracingConfig.exporterType !== 'none' ? 'ENABLED' : 'DISABLED'}
Exporter: ${tracingConfig.exporterType}
Endpoint: ${tracingConfig.endpoint}
Capabilities: ${agent.capabilities.join(', ')}

Tracing Features:
- Automatic span creation ✓
- Performance metrics ✓
- Error tracking ✓
- Distributed context propagation ✓

Example usage:
{
  "task": "Get product recommendations",
  "data": {
    "userId": "user-123",
    "category": "electronics"
  }
}
===========================================
    `);
    
  } catch (error) {
    logger.error({ error }, 'Failed to start agent');
    process.exit(1);
  }
}

// Run if main module
if (require.main === module) {
  main().catch(error => {
    logger.error({ error }, 'Agent crashed');
    process.exit(1);
  });
}

export { TracedRecommendationAgent };