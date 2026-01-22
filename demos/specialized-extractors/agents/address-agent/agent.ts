/**
 * Address Extractor Agent
 *
 * Specializes in finding and parsing physical addresses from unstructured text.
 * Part of the specialized extractors demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'address-extractor';
const AGENT_NAME = 'Address Extractor';

class AddressExtractorAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['extraction', 'addresses', 'locations', 'parsing'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts and parses physical addresses from unstructured text'
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

    const prompt = `You are a specialized address extraction agent. Your ONLY job is to find and parse ALL physical addresses from the given text.

Text to analyze:
"""
${text}
"""

Extract ALL physical addresses found in the text. For each address:
1. Find the complete address as it appears in the text
2. Parse it into structured components
3. Identify what the address represents (e.g., "billing address", "shipping address", "business address", etc.)

You MUST respond in this exact JSON format:
{
  "addresses": [
    {
      "original": "<the complete address as it appears>",
      "street": "<street address including number>",
      "city": "<city name>",
      "state": "<state/province/region>",
      "postalCode": "<zip/postal code>",
      "country": "<country, default to USA if clearly American address>",
      "type": "<what this address represents>",
      "confidence": <0.0 to 1.0>
    }
  ],
  "count": <number of addresses found>,
  "reasoning": "<brief explanation of extraction process>"
}

If no addresses are found, return an empty array for addresses.
Be thorough - look for partial addresses too, even if some components are missing.
Handle various formats: "123 Main St, City, ST 12345", "123 Main Street\\nCity, State 12345", etc.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { addresses: [], count: 0, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const addresses = parsed.addresses || [];

      // Calculate overall confidence based on individual address confidences
      const avgConfidence = addresses.length > 0
        ? addresses.reduce((sum: number, a: any) => sum + (a.confidence || 0.8), 0) / addresses.length
        : 0.5;

      return {
        value: {
          addresses: addresses,
          count: addresses.length,
          model: MODEL_NAME
        },
        confidence: avgConfidence,
        reasoning: parsed.reasoning || `Extracted ${addresses.length} addresses from text`
      };
    } catch (error) {
      console.error('Extraction error:', error);
      return {
        value: { addresses: [], count: 0, error: String(error) },
        confidence: 0,
        reasoning: 'Extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new AddressExtractorAgent();
  const port = parseInt(process.env.AGENT_PORT || '50303', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
