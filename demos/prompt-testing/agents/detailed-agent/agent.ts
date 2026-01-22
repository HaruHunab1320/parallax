/**
 * Detailed Prompt Agent
 *
 * Uses a comprehensive prompt style that requests thorough, well-structured responses.
 * Good for educational content, documentation, or detailed explanations.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'detailed-agent';
const AGENT_NAME = 'Detailed Agent';
const PROMPT_STYLE = 'detailed';

class DetailedAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['prompt', 'testing', 'variant', 'detailed'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        promptStyle: PROMPT_STYLE,
        description: 'Generates thorough, well-structured responses'
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

    const userQuery = data?.query || data?.question || task;

    // Detailed prompt style - structured, comprehensive output
    const prompt = `You are a knowledgeable assistant. Provide a comprehensive, well-structured answer.

Your response should:
1. Start with a clear overview
2. Cover key points with explanations
3. Include relevant examples or details
4. End with a brief summary or takeaway

Question: ${userQuery}

Respond in JSON format:
{
  "answer": "<your detailed, well-structured answer>",
  "confidence": <0-100 how confident you are in this answer>
}`;

    const startTime = Date.now();

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const latencyMs = Date.now() - startTime;

      // Try to parse JSON, fallback to raw text
      let response = responseText;
      let confidence = 0.80;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          response = parsed.answer || responseText;
          confidence = Math.max(0, Math.min(1, (parsed.confidence || 80) / 100));
        }
      } catch {
        // Use raw response if JSON parsing fails
      }

      return {
        value: {
          response: response,
          promptStyle: PROMPT_STYLE,
          promptLength: prompt.length,
          responseLength: response.length,
          latencyMs: latencyMs,
          variantType: 'detailed',
          model: MODEL_NAME
        },
        confidence: confidence,
        reasoning: `Detailed response: ${response.length} chars in ${latencyMs}ms (${Math.round(confidence * 100)}% confident)`
      };
    } catch (error) {
      console.error('Generation error:', error);
      return {
        value: { error: String(error), variantType: 'detailed' },
        confidence: 0,
        reasoning: 'Generation failed'
      };
    }
  }
}

async function main() {
  const agent = new DetailedAgent();
  const port = parseInt(process.env.AGENT_PORT || '50701', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
