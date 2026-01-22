/**
 * Amount Extractor Agent
 *
 * Specializes in finding and normalizing monetary amounts from unstructured text.
 * Part of the specialized extractors demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'amount-extractor';
const AGENT_NAME = 'Amount Extractor';

class AmountExtractorAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['extraction', 'amounts', 'currency', 'parsing'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts and normalizes monetary amounts from unstructured text'
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

    const text = data?.text || data?.document || task;

    const prompt = `You are a specialized monetary amount extraction agent. Your ONLY job is to find and extract ALL monetary amounts from the given text.

Text to analyze:
"""
${text}
"""

Extract ALL monetary amounts found in the text. For each amount:
1. Find the original text that represents the amount
2. Normalize it to a standard numeric format
3. Identify the currency (USD, EUR, GBP, etc.)
4. Identify what the amount represents (e.g., "total", "subtotal", "tax", "payment", etc.)

You MUST respond in this exact JSON format:
{
  "amounts": [
    {
      "original": "<the original amount text as it appears>",
      "value": <numeric value without currency symbol>,
      "currency": "<ISO currency code like USD, EUR, GBP>",
      "type": "<what this amount represents>",
      "confidence": <0.0 to 1.0>
    }
  ],
  "count": <number of amounts found>,
  "total": <sum of all amounts in the primary currency if applicable, or null>,
  "reasoning": "<brief explanation of extraction process>"
}

If no amounts are found, return an empty array for amounts.
Be thorough - look for amounts in various formats: "$1,234.56", "1234.56 USD", "€50", "fifty dollars", etc.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { amounts: [], count: 0, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const amounts = parsed.amounts || [];

      // Calculate overall confidence based on individual amount confidences
      const avgConfidence = amounts.length > 0
        ? amounts.reduce((sum: number, a: any) => sum + (a.confidence || 0.8), 0) / amounts.length
        : 0.5;

      return {
        value: {
          amounts: amounts,
          count: amounts.length,
          total: parsed.total,
          model: MODEL_NAME
        },
        confidence: avgConfidence,
        reasoning: parsed.reasoning || `Extracted ${amounts.length} monetary amounts from text`
      };
    } catch (error) {
      console.error('Extraction error:', error);
      return {
        value: { amounts: [], count: 0, error: String(error) },
        confidence: 0,
        reasoning: 'Extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new AmountExtractorAgent();
  const port = parseInt(process.env.AGENT_PORT || '50301', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
