/**
 * Completeness Checker Agent
 *
 * Verifies that the generated answer addresses all parts of the question.
 * Catches cases where the model only partially answers or misses sub-questions.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'completeness-checker';
const AGENT_NAME = 'Completeness Checker';

class CompletenessAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['quality-gate', 'completeness', 'verification', 'rag'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Verifies that answers are complete and address all parts of the question'
      }
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: MODEL_NAME });
      console.log(`${AGENT_NAME} initialized with ${MODEL_NAME}`);
    } else {
      console.error('GEMINI_API_KEY not set - agent will not function');
    }
  }

  async analyze(_task: string, data?: any): Promise<{
    value: any;
    confidence: number;
    reasoning?: string;
  }> {
    if (!this.model) {
      return {
        value: { error: 'Model not initialized' },
        confidence: 0,
        reasoning: 'GEMINI_API_KEY not set'
      };
    }

    const question = data?.question || '';
    const answer = data?.answer || data?.generatedAnswer || '';
    const sources = data?.sources || data?.retrievedDocs || [];
    const sourcesText = Array.isArray(sources) ? sources.join('\n\n---\n\n') : sources;

    const prompt = `You are a completeness verification agent. Your job is to check if the ANSWER fully addresses ALL parts of the QUESTION.

QUESTION: ${question}

SOURCE DOCUMENTS (for context):
"""
${sourcesText}
"""

GENERATED ANSWER:
"""
${answer}
"""

Analyze the completeness of the answer:
1. Break down the question into its component parts/sub-questions
2. Check if each part is addressed in the answer
3. Identify any gaps or missing information

You MUST respond in this exact JSON format:
{
  "passed": <true if all parts of the question are addressed, false otherwise>,
  "score": <0.0 to 1.0 - percentage of question parts addressed>,
  "questionParts": [
    {
      "part": "<component of the question>",
      "addressed": <true/false>,
      "coverage": "<how well it was addressed, or what's missing>"
    }
  ],
  "missingParts": ["<list of unaddressed question components>"],
  "suggestions": ["<suggestions for improving completeness>"],
  "reasoning": "<overall completeness assessment>"
}

Consider both explicit sub-questions and implicit information needs.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { passed: false, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(1, parsed.score || 0));

      return {
        value: {
          passed: parsed.passed === true,
          score: score,
          questionParts: parsed.questionParts || [],
          missingParts: parsed.missingParts || [],
          suggestions: parsed.suggestions || [],
          checkType: 'completeness',
          model: MODEL_NAME
        },
        confidence: score,
        reasoning: parsed.reasoning || 'Completeness check completed'
      };
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        value: { passed: false, error: String(error), checkType: 'completeness' },
        confidence: 0,
        reasoning: 'Analysis failed'
      };
    }
  }
}

async function main() {
  const agent = new CompletenessAgent();
  const port = parseInt(process.env.AGENT_PORT || '50402', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
