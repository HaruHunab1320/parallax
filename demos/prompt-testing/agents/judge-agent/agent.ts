/**
 * Judge Agent
 *
 * Evaluates and compares the responses from different prompt variants.
 * Scores on accuracy, clarity, engagement, and appropriateness.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'judge-agent';
const AGENT_NAME = 'Judge Agent';

class JudgeAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['prompt', 'testing', 'judge', 'evaluation'],
      {
        expertise: 0.95,
        model: MODEL_NAME,
        description: 'Evaluates and scores prompt variant responses'
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

    const query = data?.query || data?.question || '';
    const responses = data?.responses || [];

    if (responses.length === 0) {
      return {
        value: { error: 'No responses to judge', variantType: 'judge' },
        confidence: 0,
        reasoning: 'No variant responses provided'
      };
    }

    // Build comparison prompt
    let responsesText = '';
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      responsesText += `\n--- RESPONSE ${i + 1} (${r.promptStyle || 'unknown'} style) ---\n${r.response}\n`;
    }

    const prompt = `You are an expert evaluator of AI responses. Compare the following responses to the same question and determine which is best.

ORIGINAL QUESTION:
"${query}"

RESPONSES TO EVALUATE:
${responsesText}

Evaluate each response on:
1. **Accuracy** (0-100): Is the information correct?
2. **Clarity** (0-100): Is it easy to understand?
3. **Engagement** (0-100): Is it interesting to read?
4. **Appropriateness** (0-100): Does the style match what a typical user would want?

You MUST respond in this exact JSON format:
{
  "evaluations": [
    {
      "variant": "<variant name>",
      "scores": {
        "accuracy": <0-100>,
        "clarity": <0-100>,
        "engagement": <0-100>,
        "appropriateness": <0-100>,
        "overall": <0-100>
      },
      "strengths": ["<list of strengths>"],
      "weaknesses": ["<list of weaknesses>"]
    }
  ],
  "winner": "<best variant name>",
  "winnerReason": "<why this variant won>",
  "recommendation": "<when to use each style>"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse evaluation', variantType: 'judge' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        value: {
          ...parsed,
          variantType: 'judge',
          model: MODEL_NAME
        },
        confidence: 0.95,
        reasoning: `Evaluated ${responses.length} variants, winner: ${parsed.winner}`
      };
    } catch (error) {
      console.error('Evaluation error:', error);
      return {
        value: { error: String(error), variantType: 'judge' },
        confidence: 0,
        reasoning: 'Evaluation failed'
      };
    }
  }
}

async function main() {
  const agent = new JudgeAgent();
  const port = parseInt(process.env.AGENT_PORT || '50703', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
