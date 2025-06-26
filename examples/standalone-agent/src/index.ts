import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

/**
 * Example sentiment analysis agent that runs as a standalone gRPC service
 */
class SentimentAnalysisAgent extends ParallaxAgent {
  constructor() {
    super(
      'sentiment-agent-1',
      'Sentiment Analyzer',
      ['analysis', 'text', 'sentiment'],
      {
        expertise: 0.85,
        capabilityScores: {
          'sentiment': 0.9,
          'emotion': 0.8,
          'text': 0.85
        }
      }
    );
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Simple sentiment analysis logic
    const text = data?.text || task;
    
    // Mock sentiment scores
    const sentiments = {
      positive: 0,
      negative: 0,
      neutral: 0
    };
    
    // Very basic keyword analysis
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'love', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'horrible', 'worst'];
    
    const words = text.toLowerCase().split(/\s+/);
    
    for (const word of words) {
      if (positiveWords.includes(word)) {
        sentiments.positive++;
      } else if (negativeWords.includes(word)) {
        sentiments.negative++;
      } else {
        sentiments.neutral++;
      }
    }
    
    // Calculate dominant sentiment
    const total = sentiments.positive + sentiments.negative + sentiments.neutral;
    let dominant = 'neutral';
    let confidence = 0.5;
    
    if (total > 0) {
      const positiveRatio = sentiments.positive / total;
      const negativeRatio = sentiments.negative / total;
      
      if (positiveRatio > 0.5) {
        dominant = 'positive';
        confidence = 0.7 + (positiveRatio - 0.5) * 0.6; // 0.7 to 1.0
      } else if (negativeRatio > 0.5) {
        dominant = 'negative';
        confidence = 0.7 + (negativeRatio - 0.5) * 0.6;
      } else {
        confidence = 0.6; // Mixed sentiment
      }
    }
    
    const result = {
      sentiment: dominant,
      scores: {
        positive: sentiments.positive / (total || 1),
        negative: sentiments.negative / (total || 1),
        neutral: sentiments.neutral / (total || 1)
      },
      wordCount: words.length,
      reasoning: `Analyzed ${words.length} words. Found ${sentiments.positive} positive, ${sentiments.negative} negative, and ${sentiments.neutral} neutral words.`,
      uncertainties: confidence < 0.7 ? ['Limited keyword matching', 'No context understanding'] : undefined
    };
    
    return [result, confidence];
  }
  
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded', message?: string }> {
    // Could check model loading, memory usage, etc.
    return { 
      status: 'healthy',
      message: 'Sentiment analysis agent is operational'
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const agent = new SentimentAnalysisAgent();
  
  // Start on a specific port or let the system assign one
  const port = parseInt(process.env.PORT || '0');
  
  console.log('Starting Sentiment Analysis Agent...');
  const actualPort = await serveAgent(agent, port);
  
  console.log(`
===========================================
Sentiment Analysis Agent Started
===========================================
Agent ID: ${agent.id}
Name: ${agent.name}
Port: ${actualPort}
Capabilities: ${agent.capabilities.join(', ')}

To use this agent with Parallax:
1. Register it with the control plane
2. Or set environment variable:
   PARALLAX_LOCAL_AGENTS="${agent.id}:${agent.name}:localhost:${actualPort}:${agent.capabilities.join(',')}"
===========================================
  `);
}

// Run the agent
main().catch(console.error);