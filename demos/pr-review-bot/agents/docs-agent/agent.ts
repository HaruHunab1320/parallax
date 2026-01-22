/**
 * Documentation Agent for PR Review Bot
 *
 * Analyzes code for documentation quality - comments, docstrings, clarity.
 * Demonstrates a TypeScript agent in the Parallax multi-language ecosystem.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Documentation patterns to check (fallback when no LLM)
const DOC_PATTERNS = [
  {
    pattern: /export\s+(async\s+)?function\s+\w+\s*\([^)]*\)[^{]*\{(?!\s*\/\*\*|\s*\/\/)/g,
    severity: 'medium',
    issue: 'Exported function lacks documentation',
    suggestion: 'Add JSDoc comment describing purpose, parameters, and return value'
  },
  {
    pattern: /export\s+class\s+\w+[^{]*\{(?!\s*\/\*\*|\s*\/\/)/g,
    severity: 'medium',
    issue: 'Exported class lacks documentation',
    suggestion: 'Add JSDoc comment describing the class purpose'
  },
  {
    pattern: /\/\/\s*TODO[^:\n]*$/gm,
    severity: 'low',
    issue: 'TODO comment without description',
    suggestion: 'Add details about what needs to be done'
  },
  {
    pattern: /function\s+\w{1,2}\s*\(|const\s+\w{1,2}\s*=/g,
    severity: 'medium',
    issue: 'Single-letter or very short variable/function name',
    suggestion: 'Use descriptive names that explain purpose'
  },
  {
    pattern: /\/\*\*[\s\S]*?\*\/\s*\n\s*\/\*\*/g,
    severity: 'low',
    issue: 'Multiple consecutive doc comments may indicate stale docs',
    suggestion: 'Review and consolidate documentation'
  }
];

class DocsAgent extends ParallaxAgent {
  private gemini: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    super(
      'docs-agent',
      'Documentation Analyzer',
      ['documentation', 'clarity', 'readability'],
      {
        expertise: 0.8,
        language: 'typescript',
        description: 'Analyzes code for documentation quality and clarity'
      }
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      console.log('Gemini LLM initialized for documentation analysis');
    } else {
      console.warn('GEMINI_API_KEY not set - using pattern-based analysis');
    }
  }

  async analyze(task: string, data?: any): Promise<{
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
          documentation_score: 0,
        },
        confidence: 0.5,
        reasoning: 'Empty input'
      };
    }

    if (this.model) {
      try {
        return await this.analyzeWithLLM(code);
      } catch (error) {
        console.warn('LLM analysis failed, falling back to patterns:', error);
      }
    }

    return this.analyzeWithPatterns(code);
  }

  private async analyzeWithLLM(code: string): Promise<{
    value: any;
    confidence: number;
    reasoning?: string;
  }> {
    const prompt = `Analyze the following code for documentation quality.

For each issue found, provide:
- severity: "high", "medium", or "low"
- issue: Brief description of the documentation problem
- line_hint: Approximate location in the code
- suggestion: How to improve the documentation

Also provide:
- documentation_score: 0-100 rating of documentation quality
- confidence: Your confidence in this analysis (0.0 to 1.0)

Focus on:
- Missing function/method documentation
- Missing parameter descriptions
- Missing return value documentation
- Unclear or cryptic variable names
- Missing class/module level documentation
- Outdated or misleading comments

Respond in JSON format:
{
  "findings": [
    {"severity": "...", "issue": "...", "line_hint": "...", "suggestion": "..."}
  ],
  "summary": "Overall documentation assessment",
  "documentation_score": 60,
  "well_documented": ["list of well-documented items"],
  "needs_documentation": ["list of items needing docs"],
  "confidence": 0.85,
  "reasoning": "Why you are this confident"
}

Code to analyze:
\`\`\`
${code}
\`\`\``;

    const result = await this.model.generateContent(prompt);
    const text = result.response.text();

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
          documentation_score: 50,
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

    for (const pattern of DOC_PATTERNS) {
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

    // Check for good documentation (JSDoc comments)
    const jsdocCount = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
    const functionCount = (code.match(/function\s+\w+|=>\s*\{|=>\s*[^{]/g) || []).length;

    const docRatio = functionCount > 0 ? jsdocCount / functionCount : 0;
    const documentationScore = Math.round(Math.min(100, docRatio * 100 + 20));

    const baseConfidence = 0.6;
    const confidence = Math.min(0.75, baseConfidence + findings.length * 0.02);

    return {
      value: {
        findings,
        summary: findings.length > 0
          ? `Found ${findings.length} documentation issue(s)`
          : 'Documentation appears adequate',
        documentation_score: documentationScore,
        jsdoc_comments: jsdocCount,
        functions_detected: functionCount,
        analysis_method: 'pattern_matching'
      },
      confidence,
      reasoning: 'Pattern-based analysis (LLM not available)'
    };
  }
}

async function main() {
  const agent = new DocsAgent();
  const port = parseInt(process.env.AGENT_PORT || '50102', 10);

  await serveAgent(agent, port);

  console.log(`Documentation Agent running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
