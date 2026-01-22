/**
 * Date Extractor Agent
 *
 * Specializes in finding and normalizing dates from unstructured text.
 * Part of the specialized extractors demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'date-extractor';
const AGENT_NAME = 'Date Extractor';

class DateExtractorAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['extraction', 'dates', 'parsing'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts and normalizes dates from unstructured text'
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

    const prompt = `You are a specialized date extraction agent. Your ONLY job is to find and extract ALL dates from the given text.

Text to analyze:
"""
${text}
"""

Extract ALL dates found in the text. For each date:
1. Find the original text that represents the date
2. Normalize it to ISO 8601 format (YYYY-MM-DD)
3. Identify what the date represents (e.g., "invoice date", "due date", "birth date", etc.)

You MUST respond in this exact JSON format:
{
  "dates": [
    {
      "original": "<the original date text as it appears>",
      "normalized": "<YYYY-MM-DD format>",
      "type": "<what this date represents>",
      "confidence": <0.0 to 1.0>
    }
  ],
  "count": <number of dates found>,
  "reasoning": "<brief explanation of extraction process>"
}

If no dates are found, return an empty array for dates.
Be thorough - look for dates in various formats: "January 15, 2024", "01/15/24", "2024-01-15", "15th of January", etc.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { dates: [], count: 0, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const dates = parsed.dates || [];

      // Calculate overall confidence based on individual date confidences
      const avgConfidence = dates.length > 0
        ? dates.reduce((sum: number, d: any) => sum + (d.confidence || 0.8), 0) / dates.length
        : 0.5;

      return {
        value: {
          dates: dates,
          count: dates.length,
          model: MODEL_NAME
        },
        confidence: avgConfidence,
        reasoning: parsed.reasoning || `Extracted ${dates.length} dates from text`
      };
    } catch (error) {
      console.error('Extraction error:', error);
      return {
        value: { dates: [], count: 0, error: String(error) },
        confidence: 0,
        reasoning: 'Extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new DateExtractorAgent();
  const port = parseInt(process.env.AGENT_PORT || '50300', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
