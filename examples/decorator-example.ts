import { ParallaxAgent, withConfidence, AgentResult } from '@parallax/sdk-typescript';

/**
 * Example showing different ways to use the @withConfidence decorator
 */
class SecurityAnalysisAgent extends ParallaxAgent {
  constructor() {
    super(
      'security-decorator-example',
      'Security Analyzer with Decorators',
      ['security', 'code-analysis']
    );
  }

  /**
   * Method 1: Traditional analyze method (no decorator)
   * Returns tuple as expected by base class
   */
  async analyze(task: string, data?: any): Promise<[any, number]> {
    if (task === 'quick-scan') {
      return this.quickScan(task, data);
    }
    
    const result = {
      vulnerabilities: ['XSS risk in line 45'],
      severity: 'medium',
      reasoning: 'Found unescaped user input'
    };
    return [result, 0.75];
  }

  /**
   * Method 2: Using decorator with tuple return
   * Decorator will convert to AgentResult
   */
  @withConfidence()
  async quickScan(task: string, data?: any): Promise<[any, number]> {
    const issues = this.scanForIssues(data?.code || '');
    
    if (issues.length > 0) {
      return [{
        issues,
        severity: 'high',
        reasoning: 'Known vulnerability patterns detected'
      }, 0.95];
    }
    
    return [{
      issues: [],
      severity: 'none',
      reasoning: 'No obvious vulnerabilities'
    }, 0.6];
  }

  /**
   * Method 3: Using decorator with custom confidence extraction
   * Returns complex object, decorator extracts confidence
   */
  @withConfidence({
    extractConfidence: (result) => result.analysis.confidenceScore / 100
  })
  async deepAnalysis(task: string, data?: any): Promise<any> {
    const analysis = await this.performDeepAnalysis(data);
    
    return {
      findings: analysis.vulnerabilities,
      analysis: {
        confidenceScore: 85,  // Will be extracted by decorator
        coverage: 0.92,
        duration: '2.3s'
      },
      reasoning: 'Comprehensive static analysis completed',
      uncertainties: ['Dynamic behavior not analyzed', 'Third-party libraries not scanned']
    };
  }

  /**
   * Method 4: Using decorator with default confidence
   * When confidence is not always available
   */
  @withConfidence({ defaultConfidence: 0.7 })
  async experimentalScan(task: string, data?: any): Promise<any> {
    try {
      const result = await this.runExperimentalScanner(data);
      
      // Sometimes returns with confidence
      if (result.isHighRisk) {
        return [{
          threat: 'Critical vulnerability',
          details: result.details
        }, 0.99];  // Tuple format when confident
      }
      
      // Sometimes returns without confidence (uses default)
      return {
        status: 'clean',
        notes: result.notes
      };
    } catch (error) {
      // Error case - uses default confidence
      return {
        error: 'Experimental scanner failed',
        fallback: 'Use standard scanner'
      };
    }
  }

  /**
   * Method 5: Already returns AgentResult
   * Decorator passes through unchanged
   */
  @withConfidence()
  async structuredAnalysis(task: string, data?: any): Promise<AgentResult> {
    const scanResult = await this.scanForIssues(data?.code || '');
    
    // Already in correct format
    return {
      value: {
        vulnerabilities: scanResult,
        recommendations: this.generateRecommendations(scanResult)
      },
      confidence: scanResult.length > 0 ? 0.9 : 0.5,
      agent: this.id,
      reasoning: 'Structured security analysis',
      uncertainties: ['Runtime behavior unknown'],
      timestamp: Date.now()
    };
  }

  // Helper methods
  private scanForIssues(code: string): string[] {
    const issues = [];
    if (code.includes('eval(')) issues.push('Dangerous eval() usage');
    if (code.includes('innerHTML =')) issues.push('Potential XSS via innerHTML');
    if (code.includes('SELECT * FROM')) issues.push('Potential SQL injection');
    return issues;
  }

  private async performDeepAnalysis(data: any): Promise<any> {
    // Simulate deep analysis
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      vulnerabilities: this.scanForIssues(data?.code || ''),
      complexity: Math.random() * 100
    };
  }

  private async runExperimentalScanner(data: any): Promise<any> {
    // Simulate experimental scanner
    const risk = Math.random() > 0.8;
    return {
      isHighRisk: risk,
      details: risk ? 'Buffer overflow detected' : 'No issues',
      notes: 'Experimental results'
    };
  }

  private generateRecommendations(issues: string[]): string[] {
    return issues.map(issue => `Fix: ${issue}`);
  }
}

// Example usage
async function demo() {
  const agent = new SecurityAnalysisAgent();
  
  console.log('\n1. Traditional analyze method:');
  const [result1, conf1] = await agent.analyze('scan', { code: 'eval(userInput)' });
  console.log('Result:', result1);
  console.log('Confidence:', conf1);
  
  console.log('\n2. Decorated quickScan method:');
  const result2 = await agent.quickScan('scan', { code: 'element.innerHTML = data' });
  console.log('Result:', result2);
  // Note: When called directly, decorator returns AgentResult format
  
  console.log('\n3. Deep analysis with extracted confidence:');
  const result3 = await agent.deepAnalysis('deep-scan', { code: 'SELECT * FROM users' });
  console.log('Result:', result3);
  
  console.log('\n4. Experimental scan with default confidence:');
  const result4 = await agent.experimentalScan('experimental', { code: 'safe code' });
  console.log('Result:', result4);
  
  console.log('\n5. Structured analysis already in AgentResult format:');
  const result5 = await agent.structuredAnalysis('structured', { code: 'eval(data)' });
  console.log('Result:', result5);
}

// Run demo if called directly
if (require.main === module) {
  demo().catch(console.error);
}

export { SecurityAnalysisAgent };