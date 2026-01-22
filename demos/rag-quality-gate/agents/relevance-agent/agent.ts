/**
 * Relevance Checker Agent
 *
 * Verifies that the generated answer actually addresses the user's question.
 * Catches cases where the model goes off-topic or misunderstands the question.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'relevance-checker';
const AGENT_NAME = 'Relevance Checker';

class RelevanceAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['quality-gate', 'relevance', 'verification', 'rag'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Verifies that answers are relevant to the question asked'
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

  async analyze(task: string, data?: any): Promise<{
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

    const prompt = `You are a relevance verification agent. Your job is to check if the ANSWER directly addresses the QUESTION.

QUESTION: ${question}

GENERATED ANSWER:
"""
${answer}
"""

Analyze whether the answer is relevant to the question:
1. Does the answer address the main topic of the question?
2. Does the answer attempt to answer what was asked?
3. Is there any off-topic content that doesn't relate to the question?

You MUST respond in this exact JSON format:
{
  "passed": <true if the answer is relevant to the question, false otherwise>,
  "score": <0.0 to 1.0 - how relevant is the answer>,
  "topicMatch": <true if the answer is about the same topic as the question>,
  "addressesIntent": <true if the answer attempts to fulfill the question's intent>,
  "offTopicContent": ["<list of off-topic statements if any>"],
  "missingFocus": "<what the answer should have focused on but didn't, or null>",
  "reasoning": "<explanation of relevance assessment>"
}

Be practical - answers can include context and background as long as they address the main question.`;

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
          topicMatch: parsed.topicMatch,
          addressesIntent: parsed.addressesIntent,
          offTopicContent: parsed.offTopicContent || [],
          missingFocus: parsed.missingFocus,
          checkType: 'relevance',
          model: MODEL_NAME
        },
        confidence: score,
        reasoning: parsed.reasoning || 'Relevance check completed'
      };
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        value: { passed: false, error: String(error), checkType: 'relevance' },
        confidence: 0,
        reasoning: 'Analysis failed'
      };
    }
  }
}

async function main() {
  const agent = new RelevanceAgent();
  const port = parseInt(process.env.AGENT_PORT || '50401', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
