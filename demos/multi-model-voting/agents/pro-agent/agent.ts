/**
 * Gemini 2.5 Pro Voting Agent
 *
 * Uses Google's most capable model for thoughtful decision-making.
 * Part of the multi-model voting demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-3-pro-preview';
const AGENT_ID = 'gemini-pro';
const AGENT_NAME = 'Gemini 3 Pro Voter';

class ProAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['voting', 'classification', 'decision', 'reasoning'],
      {
        expertise: 0.95,
        model: MODEL_NAME,
        description: 'Thoughtful decision-making with Gemini 3 Pro'
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

    const prompt = `You are a careful decision-making agent. Analyze the following question thoroughly and choose ONE option.

Question: ${question}

${context ? `Context: ${context}\n` : ''}
Available options: ${options.join(', ')}

Think step by step:
1. What are the key factors to consider?
2. What evidence supports each option?
3. What is the most defensible choice?

You MUST respond in this exact JSON format:
{
  "decision": "<one of the options exactly as written>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<detailed explanation of your decision process>",
  "key_factors": ["<factor 1>", "<factor 2>"]
}

Be thorough but decisive. Consider edge cases and nuances.`;

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
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.8));

      // Validate decision is one of the options
      const normalizedDecision = parsed.decision?.toLowerCase?.();
      const validDecision = options.some(
        (opt: string) => opt.toLowerCase() === normalizedDecision
      );

      return {
        value: {
          decision: validDecision ? parsed.decision : options[0],
          model: MODEL_NAME,
          raw_decision: parsed.decision,
          key_factors: parsed.key_factors || []
        },
        confidence: validDecision ? confidence : confidence * 0.5,
        reasoning: parsed.reasoning || 'Decision made after careful analysis'
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
  const agent = new ProAgent();
  const port = parseInt(process.env.AGENT_PORT || '50201', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
