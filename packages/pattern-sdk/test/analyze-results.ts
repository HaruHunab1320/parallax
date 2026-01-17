/**
 * Result Analyzer for Battle Test
 * 
 * Analyzes the battle test results to provide actionable insights
 */

import * as fs from 'fs-extra';
import * as path from 'path';

interface AnalysisInsight {
  category: string;
  insight: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

class ResultAnalyzer {
  private reportPath: string;
  private patternsDir: string;
  
  constructor() {
    this.reportPath = path.join(__dirname, 'battle-test-results', 'battle-test-report.json');
    this.patternsDir = path.join(__dirname, 'battle-test-results', 'patterns');
  }
  
  async analyze(): Promise<void> {
    console.log('📊 Analyzing Battle Test Results\n');
    
    // Check if report exists
    if (!await fs.pathExists(this.reportPath)) {
      console.log('❌ No test results found. Run tests first with --mini or --full');
      return;
    }
    
    // Load report
    const report = await fs.readJson(this.reportPath);
    
    // Generate insights
    const insights = this.generateInsights(report);
    
    // Analyze pattern quality
    const patternQuality = await this.analyzePatternQuality();
    
    // Generate improvement roadmap
    const roadmap = this.generateImprovementRoadmap(report, insights);
    
    // Save analysis
    await this.saveAnalysis({
      insights,
      patternQuality,
      roadmap,
      timestamp: new Date().toISOString()
    });
    
    // Print key findings
    this.printKeyFindings(report, insights, roadmap);
  }
  
  private generateInsights(report: any): AnalysisInsight[] {
    const insights: AnalysisInsight[] = [];
    
    // Overall success rate insight
    if (report.summary.successRate < 50) {
      insights.push({
        category: 'overall',
        insight: `Low overall success rate: ${report.summary.successRate}%`,
        severity: 'critical',
        recommendation: 'Major improvements needed in pattern generation logic'
      });
    } else if (report.summary.successRate < 80) {
      insights.push({
        category: 'overall',
        insight: `Moderate success rate: ${report.summary.successRate}%`,
        severity: 'high',
        recommendation: 'Focus on fixing common issues to improve success rate'
      });
    }
    
    // Category-specific insights
    Object.entries(report.byCategory).forEach(([category, stats]: [string, any]) => {
      if (stats.successRate === 0) {
        insights.push({
          category,
          insight: `Complete failure in ${category} patterns`,
          severity: 'critical',
          recommendation: `Redesign ${category} pattern handling`
        });
      } else if (stats.successRate < 50) {
        insights.push({
          category,
          insight: `Poor performance in ${category}: ${stats.successRate}% success`,
          severity: 'high',
          recommendation: `Review and fix ${category} pattern generation`
        });
      }
    });
    
    // Common issue insights
    const topIssues = report.commonIssues.slice(0, 3);
    topIssues.forEach((issue: any) => {
      if (issue.count > report.summary.totalTests * 0.3) {
        insights.push({
          category: 'common-issues',
          insight: `"${issue.issue}" affects ${Math.round((issue.count / report.summary.totalTests) * 100)}% of tests`,
          severity: 'high',
          recommendation: `Priority fix needed for: ${issue.issue}`
        });
      }
    });
    
    // Confidence flow insight
    const confidenceFlowRate = report.summary.properConfidenceFlowRate;
    if (confidenceFlowRate < 70) {
      insights.push({
        category: 'confidence',
        insight: `Poor confidence flow implementation: ${confidenceFlowRate}%`,
        severity: 'high',
        recommendation: 'Improve confidence extraction and propagation logic'
      });
    }
    
    return insights;
  }
  
  private async analyzePatternQuality(): Promise<any> {
    const patterns = await this.loadGeneratedPatterns();
    
    const quality = {
      totalPatterns: patterns.length,
      averageLineCount: 0,
      usesProperImports: 0,
      hasConfidenceFlow: 0,
      hasRedundantSteps: 0,
      complexityDistribution: {
        low: 0,
        medium: 0,
        high: 0
      }
    };
    
    patterns.forEach(({ content, filename }) => {
      const lines = content.split('\n');
      quality.averageLineCount += lines.length;
      
      // Check imports
      if (content.includes('import {') && content.includes('from "@parallax/primitives')) {
        quality.usesProperImports++;
      }
      
      // Check confidence flow
      if (content.includes('finalConfidence = result.confidence') && 
          content.includes('~> finalConfidence')) {
        quality.hasConfidenceFlow++;
      }
      
      // Check for redundant steps
      if (content.match(/step\d+ = step\d+\s*\n/g)) {
        quality.hasRedundantSteps++;
      }
      
      // Estimate complexity
      const primitiveCount = (content.match(/step\d+/g) || []).length;
      if (primitiveCount <= 3) quality.complexityDistribution.low++;
      else if (primitiveCount <= 6) quality.complexityDistribution.medium++;
      else quality.complexityDistribution.high++;
    });
    
    if (patterns.length > 0) {
      quality.averageLineCount = Math.round(quality.averageLineCount / patterns.length);
    }
    
    return quality;
  }
  
  private async loadGeneratedPatterns(): Promise<Array<{ filename: string; content: string }>> {
    const patterns: Array<{ filename: string; content: string }> = [];
    
    if (await fs.pathExists(this.patternsDir)) {
      const files = await this.getAllFiles(this.patternsDir);
      for (const file of files) {
        if (file.endsWith('.prism')) {
          const content = await fs.readFile(file, 'utf8');
          patterns.push({ filename: path.basename(file), content });
        }
      }
    }
    
    return patterns;
  }
  
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  private generateImprovementRoadmap(report: any, insights: AnalysisInsight[]): any {
    const roadmap = {
      immediate: [] as string[],
      shortTerm: [] as string[],
      longTerm: [] as string[]
    };
    
    // Critical issues need immediate attention
    insights.filter(i => i.severity === 'critical').forEach(insight => {
      roadmap.immediate.push(insight.recommendation);
    });
    
    // High severity issues for short term
    insights.filter(i => i.severity === 'high').forEach(insight => {
      roadmap.shortTerm.push(insight.recommendation);
    });
    
    // Based on success rates
    if (report.summary.validSyntaxRate < 90) {
      roadmap.immediate.push('Fix Prism syntax generation issues');
    }
    
    if (report.summary.properConfidenceFlowRate < 80) {
      roadmap.shortTerm.push('Improve confidence propagation implementation');
    }
    
    // Long term improvements
    roadmap.longTerm.push('Implement primitive optimization logic');
    roadmap.longTerm.push('Add pattern complexity analysis and optimization');
    roadmap.longTerm.push('Create pattern templates for common use cases');
    
    return roadmap;
  }
  
  private async saveAnalysis(analysis: any): Promise<void> {
    const analysisPath = path.join(__dirname, 'battle-test-results', 'analysis.json');
    await fs.writeJson(analysisPath, analysis, { spaces: 2 });
    
    // Also save a markdown version
    const mdPath = path.join(__dirname, 'battle-test-results', 'analysis.md');
    const markdown = this.generateAnalysisMarkdown(analysis);
    await fs.writeFile(mdPath, markdown, 'utf8');
  }
  
  private generateAnalysisMarkdown(analysis: any): string {
    let md = '# Pattern SDK Battle Test Analysis\n\n';
    md += `Generated: ${analysis.timestamp}\n\n`;
    
    // Key Insights
    md += '## Key Insights\n\n';
    const criticalInsights = analysis.insights.filter((i: AnalysisInsight) => i.severity === 'critical');
    const highInsights = analysis.insights.filter((i: AnalysisInsight) => i.severity === 'high');
    
    if (criticalInsights.length > 0) {
      md += '### 🚨 Critical Issues\n\n';
      criticalInsights.forEach((i: AnalysisInsight) => {
        md += `- **${i.insight}**\n  - Category: ${i.category}\n  - Action: ${i.recommendation}\n\n`;
      });
    }
    
    if (highInsights.length > 0) {
      md += '### ⚠️ High Priority Issues\n\n';
      highInsights.forEach((i: AnalysisInsight) => {
        md += `- **${i.insight}**\n  - Category: ${i.category}\n  - Action: ${i.recommendation}\n\n`;
      });
    }
    
    // Pattern Quality
    md += '## Pattern Quality Analysis\n\n';
    const q = analysis.patternQuality;
    md += `- **Total Patterns Generated**: ${q.totalPatterns}\n`;
    md += `- **Average Lines of Code**: ${q.averageLineCount}\n`;
    md += `- **Proper Imports**: ${q.usesProperImports}/${q.totalPatterns} (${Math.round((q.usesProperImports/q.totalPatterns)*100)}%)\n`;
    md += `- **Confidence Flow**: ${q.hasConfidenceFlow}/${q.totalPatterns} (${Math.round((q.hasConfidenceFlow/q.totalPatterns)*100)}%)\n`;
    md += `- **Redundant Steps**: ${q.hasRedundantSteps} patterns\n\n`;
    
    md += '### Complexity Distribution\n\n';
    md += `- Low: ${q.complexityDistribution.low}\n`;
    md += `- Medium: ${q.complexityDistribution.medium}\n`;
    md += `- High: ${q.complexityDistribution.high}\n\n`;
    
    // Improvement Roadmap
    md += '## Improvement Roadmap\n\n';
    
    if (analysis.roadmap.immediate.length > 0) {
      md += '### 🔴 Immediate Actions\n\n';
      analysis.roadmap.immediate.forEach((action: string) => {
        md += `1. ${action}\n`;
      });
      md += '\n';
    }
    
    if (analysis.roadmap.shortTerm.length > 0) {
      md += '### 🟡 Short Term (1-2 weeks)\n\n';
      analysis.roadmap.shortTerm.forEach((action: string) => {
        md += `1. ${action}\n`;
      });
      md += '\n';
    }
    
    if (analysis.roadmap.longTerm.length > 0) {
      md += '### 🟢 Long Term (1+ month)\n\n';
      analysis.roadmap.longTerm.forEach((action: string) => {
        md += `1. ${action}\n`;
      });
    }
    
    return md;
  }
  
  private printKeyFindings(report: any, insights: AnalysisInsight[], roadmap: any): void {
    console.log('\n📈 KEY FINDINGS\n');
    
    // Success metrics
    console.log('Success Metrics:');
    console.log(`- Overall Success Rate: ${report.summary.successRate}%`);
    console.log(`- Valid Syntax Rate: ${report.summary.validSyntaxRate}%`);
    console.log(`- Proper Confidence Flow: ${report.summary.properConfidenceFlowRate}%`);
    
    // Critical issues
    const criticalCount = insights.filter(i => i.severity === 'critical').length;
    if (criticalCount > 0) {
      console.log(`\n⚠️  ${criticalCount} CRITICAL issues found`);
    }
    
    // Top performing category
    const categories = Object.entries(report.byCategory)
      .sort((a: any, b: any) => b[1].successRate - a[1].successRate);
    if (categories.length > 0) {
      console.log(`\n✅ Best performing: ${categories[0][0]} (${categories[0][1].successRate}% success)`);
      console.log(`❌ Worst performing: ${categories[categories.length - 1][0]} (${categories[categories.length - 1][1].successRate}% success)`);
    }
    
    // Immediate actions
    if (roadmap.immediate.length > 0) {
      console.log('\n🚨 Immediate Actions Required:');
      roadmap.immediate.slice(0, 3).forEach((action: string) => {
        console.log(`- ${action}`);
      });
    }
    
    console.log('\n📄 Full analysis saved to: test/battle-test-results/analysis.md');
  }
}

// Run analyzer if called directly
if (require.main === module) {
  const analyzer = new ResultAnalyzer();
  analyzer.analyze().catch(console.error);
}

export { ResultAnalyzer };