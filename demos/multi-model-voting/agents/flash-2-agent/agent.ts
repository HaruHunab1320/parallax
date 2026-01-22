/**
 * Gemini 2.0 Flash Voting Agent
 *
 * Uses Google's newest Flash model for fast decision-making.
 * Part of the multi-model voting demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'gemini-flash-2';
const AGENT_NAME = 'Gemini 2.0 Flash Voter';

class Flash2Agent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['voting', 'classification', 'decision'],
      {
        expertise: 0.85,
        model: MODEL_NAME,
        description: 'Fast decision-making with Gemini 2.0 Flash'
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

    const question = data?.question || task;
    const options = data?.options || ['yes', 'no'];
    const context = data?.context || '';

    const prompt = `You are a decision-making agent. Answer the following question by choosing ONE option.

Question: ${question}

${context ? `Context: ${context}\n` : ''}
Available options: ${options.join(', ')}

You MUST respond in this exact JSON format:
{
  "decision": "<one of the options exactly as written>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation of your decision>"
}

Be decisive. Pick the option that best answers the question based on the information provided.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { decision: null, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));

      // Validate decision is one of the options
      const normalizedDecision = parsed.decision?.toLowerCase?.();
      const validDecision = options.some(
        (opt: string) => opt.toLowerCase() === normalizedDecision
      );

      return {
        value: {
          decision: validDecision ? parsed.decision : options[0],
          model: MODEL_NAME,
          raw_decision: parsed.decision
        },
        confidence: validDecision ? confidence : confidence * 0.5,
        reasoning: parsed.reasoning || 'Decision made'
      };
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        value: { decision: null, error: String(error) },
        confidence: 0,
        reasoning: 'Analysis failed'
      };
    }
  }
}

async function main() {
  const agent = new Flash2Agent();
  const port = parseInt(process.env.AGENT_PORT || '50200', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
