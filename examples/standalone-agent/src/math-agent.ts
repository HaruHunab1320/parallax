import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

/**
 * Example mathematical computation agent
 */
class MathComputationAgent extends ParallaxAgent {
  constructor() {
    super(
      'math-agent-1',
      'Math Computation Agent',
      ['analysis', 'computation', 'mathematics'],
      {
        expertise: 0.95,
        capabilityScores: {
          'computation': 1.0,
          'statistics': 0.9,
          'optimization': 0.8
        }
      }
    );
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    const taskLower = task.toLowerCase();
    
    if (taskLower.includes('mean') || taskLower.includes('average')) {
      return this.calculateMean(data);
    } else if (taskLower.includes('median')) {
      return this.calculateMedian(data);
    } else if (taskLower.includes('standard deviation') || taskLower.includes('std')) {
      return this.calculateStdDev(data);
    } else if (taskLower.includes('correlation')) {
      return this.calculateCorrelation(data);
    } else {
      // General statistics
      return this.calculateStats(data);
    }
  }
  
  private calculateMean(data: any): [any, number] {
    const numbers = this.extractNumbers(data);
    if (numbers.length === 0) {
      return [{ error: 'No numeric data provided' }, 0.1];
    }
    
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    
    return [{
      result: mean,
      operation: 'mean',
      dataPoints: numbers.length,
      reasoning: `Calculated mean of ${numbers.length} data points`
    }, 1.0]; // Very high confidence for simple math
  }
  
  private calculateMedian(data: any): [any, number] {
    const numbers = this.extractNumbers(data);
    if (numbers.length === 0) {
      return [{ error: 'No numeric data provided' }, 0.1];
    }
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    
    return [{
      result: median,
      operation: 'median',
      dataPoints: numbers.length,
      reasoning: `Calculated median of ${numbers.length} data points`
    }, 1.0];
  }
  
  private calculateStdDev(data: any): [any, number] {
    const numbers = this.extractNumbers(data);
    if (numbers.length < 2) {
      return [{ error: 'Need at least 2 data points for standard deviation' }, 0.1];
    }
    
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(x => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (numbers.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return [{
      result: stdDev,
      mean: mean,
      variance: variance,
      operation: 'standard_deviation',
      dataPoints: numbers.length,
      reasoning: `Calculated standard deviation of ${numbers.length} data points`
    }, 1.0];
  }
  
  private calculateCorrelation(data: any): [any, number] {
    if (!data?.x || !data?.y) {
      return [{ error: 'Need x and y arrays for correlation' }, 0.1];
    }
    
    const x = this.extractNumbers(data.x);
    const y = this.extractNumbers(data.y);
    
    if (x.length !== y.length || x.length < 2) {
      return [{ error: 'x and y must have same length and at least 2 points' }, 0.1];
    }
    
    // Pearson correlation coefficient
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
    
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return [{
      result: correlation,
      operation: 'correlation',
      dataPoints: n,
      interpretation: Math.abs(correlation) > 0.7 ? 'strong' : 
                      Math.abs(correlation) > 0.3 ? 'moderate' : 'weak',
      reasoning: `Calculated Pearson correlation for ${n} paired data points`
    }, 0.95]; // Slightly lower confidence due to assumptions
  }
  
  private calculateStats(data: any): [any, number] {
    const numbers = this.extractNumbers(data);
    if (numbers.length === 0) {
      return [{ error: 'No numeric data provided' }, 0.1];
    }
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    return [{
      summary: {
        count: numbers.length,
        mean: mean,
        min: min,
        max: max,
        range: max - min
      },
      operation: 'summary_statistics',
      reasoning: `Calculated summary statistics for ${numbers.length} data points`
    }, 0.95];
  }
  
  private extractNumbers(data: any): number[] {
    if (Array.isArray(data)) {
      return data.filter(x => typeof x === 'number' && !isNaN(x));
    } else if (data?.values && Array.isArray(data.values)) {
      return this.extractNumbers(data.values);
    } else if (data?.data && Array.isArray(data.data)) {
      return this.extractNumbers(data.data);
    }
    return [];
  }
}

// Main entry point
async function main() {
  const agent = new MathComputationAgent();
  const port = parseInt(process.env.PORT || '50052');
  
  console.log('Starting Math Computation Agent...');
  const actualPort = await serveAgent(agent, port);
  
  console.log(`Math Agent running on port ${actualPort}`);
}

if (require.main === module) {
  main().catch(console.error);
}

export { MathComputationAgent };