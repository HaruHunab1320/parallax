/**
 * Style/Quality Agent for PR Review Bot
 *
 * Analyzes code for style issues, complexity, and quality using Gemini LLM.
 * Demonstrates a TypeScript agent in the Parallax multi-language ecosystem.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Style patterns to check (fallback when no LLM)
const STYLE_PATTERNS = [
  {
    pattern: /if\s*\([^)]+\)\s*\{\s*if\s*\([^)]+\)\s*\{\s*if/g,
    severity: 'high',
    issue: 'Deeply nested conditionals (3+ levels)',
    suggestion: 'Extract conditions into separate functions or use early returns'
  },
  {
    pattern: /function\s+\w+\s*\([^)]{100,}\)/g,
    severity: 'medium',
    issue: 'Function has too many parameters',
    suggestion: 'Consider using an options object or breaking into smaller functions'
  },
  {
    pattern: /\bany\b/g,
    severity: 'medium',
    issue: 'Use of "any" type reduces type safety',
    suggestion: 'Define proper types or use "unknown" with type guards'
  },
  {
    pattern: /console\.(log|warn|error)\s*\(/g,
    severity: 'low',
    issue: 'Console statements should be removed in production',
    suggestion: 'Use a proper logging library or remove before merging'
  },
  {
    pattern: /TODO|FIXME|HACK|XXX/gi,
    severity: 'low',
    issue: 'Unresolved TODO/FIXME comment',
    suggestion: 'Address the TODO or create a tracking issue'
  },
  {
    pattern: /^\s{40,}/gm,
    severity: 'medium',
    issue: 'Excessive indentation suggests complex nesting',
    suggestion: 'Refactor to reduce nesting depth'
  },
  {
    pattern: /\bvar\b/g,
    severity: 'medium',
    issue: 'Use of "var" instead of "let" or "const"',
    suggestion: 'Prefer "const" for immutable values, "let" for mutable'
  }
];

class StyleAgent extends ParallaxAgent {
  private gemini: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    super(
      'style-agent',
      'Code Style Analyzer',
      ['style', 'code-quality', 'complexity-analysis'],
      {
        expertise: 0.85,
        language: 'typescript',
        description: 'Analyzes code for style, quality, and complexity issues'
      }
    );

    // Initialize Gemini if API key is available
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      console.log('Gemini LLM initialized for style analysis');
    } else {
      console.warn('GEMINI_API_KEY not set - using pattern-based analysis');
    }
  }

  async analyze(_task: string, data?: any): Promise<{
    value: any;
    confidence: number;
    reasoning?: string;
  }> {
    const code = typeof data === 'string' ? data : data?.code || '';

    if (!code) {
      return {
        value: {
          findings: [],
          summary: 'No code provided for analysis',
          quality_score: 0,
        },
        confidence: 0.5,
        reasoning: 'Empty input'
      };
    }

    // Try LLM analysis first
    if (this.model) {
      try {
        return await this.analyzeWithLLM(code);
      } catch (error) {
        console.warn('LLM analysis failed, falling back to patterns:', error);
      }
    }

    // Fallback to pattern-based analysis
    return this.analyzeWithPatterns(code);
  }

  private async analyzeWithLLM(code: string): Promise<{
    value: any;
    confidence: number;
    reasoning?: string;
  }> {
    const prompt = `Analyze the following code for style and quality issues.

For each issue found, provide:
- severity: "high", "medium", or "low"
- issue: Brief description of the problem
- line_hint: Approximate location in the code
- suggestion: How to improve it

Also provide:
- quality_score: 0-100 rating of overall code quality
- confidence: Your confidence in this analysis (0.0 to 1.0)

Focus on:
- Code complexity and nesting
- Naming conventions
- Function/method length
- Type safety
- Code organization
- Best practices

Respond in JSON format:
{
  "findings": [
    {"severity": "...", "issue": "...", "line_hint": "...", "suggestion": "..."}
  ],
  "summary": "Overall style assessment",
  "quality_score": 75,
  "confidence": 0.85,
  "reasoning": "Why you are this confident"
}

Code to analyze:
\`\`\`
${code}
\`\`\``;

    const result = await this.model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    try {
      const parsed = JSON.parse(jsonText);
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.75));

      return {
        value: parsed,
        confidence,
        reasoning: parsed.reasoning || 'LLM analysis completed'
      };
    } catch {
      return {
        value: {
          findings: [],
          summary: text.substring(0, 500),
          quality_score: 50,
        },
        confidence: 0.5,
        reasoning: 'Could not parse structured response'
      };
    }
  }

  private analyzeWithPatterns(code: string): {
    value: any;
    confidence: number;
    reasoning?: string;
  } {
    const findings: Array<{
      severity: string;
      issue: string;
      line_hint: string;
      suggestion: string;
    }> = [];

    for (const pattern of STYLE_PATTERNS) {
      const matches = code.matchAll(pattern.pattern);
      for (const match of matches) {
        const lineNum = code.substring(0, match.index || 0).split('\n').length;
        findings.push({
          severity: pattern.severity,
          issue: pattern.issue,
          line_hint: `Line ${lineNum}`,
          suggestion: pattern.suggestion
        });
      }
    }

    // Calculate quality score
    const deductions = findings.reduce((sum, f) => {
      if (f.severity === 'high') return sum + 15;
      if (f.severity === 'medium') return sum + 8;
      return sum + 3;
    }, 0);

    const qualityScore = Math.max(0, 100 - deductions);

    // Confidence based on analysis coverage
    const baseConfidence = 0.65;
    const confidence = findings.length > 0
      ? Math.min(0.8, baseConfidence + findings.length * 0.02)
      : 0.55; // Lower confidence when no issues found (might have missed some)

    return {
      value: {
        findings,
        summary: findings.length > 0
          ? `Found ${findings.length} style issue(s)`
          : 'No obvious style issues detected',
        quality_score: qualityScore,
        analysis_method: 'pattern_matching'
      },
      confidence,
      reasoning: 'Pattern-based analysis (LLM not available)'
    };
  }
}

async function main() {
  const agent = new StyleAgent();
  const port = parseInt(process.env.AGENT_PORT || '50101', 10);

  await serveAgent(agent, port);

  console.log(`Style Agent running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
