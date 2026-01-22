/**
 * Entity Extractor Agent
 *
 * Specializes in finding names of people and organizations from unstructured text.
 * Part of the specialized extractors demo.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'entity-extractor';
const AGENT_NAME = 'Entity Extractor';

class EntityExtractorAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['extraction', 'entities', 'names', 'organizations', 'parsing'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts names of people and organizations from unstructured text'
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

    const prompt = `You are a specialized named entity extraction agent. Your ONLY job is to find and extract ALL names of people and organizations from the given text.

Text to analyze:
"""
${text}
"""

Extract ALL named entities found in the text. For each entity:
1. Find the name as it appears in the text
2. Classify it as either "person" or "organization"
3. Identify the role or context if apparent (e.g., "customer", "vendor", "employee", "bank", etc.)

You MUST respond in this exact JSON format:
{
  "entities": [
    {
      "name": "<the name as it appears>",
      "type": "<person or organization>",
      "role": "<the role or context, or null if unknown>",
      "confidence": <0.0 to 1.0>
    }
  ],
  "people": [<list of just person names>],
  "organizations": [<list of just organization names>],
  "count": <total number of entities found>,
  "reasoning": "<brief explanation of extraction process>"
}

If no entities are found, return empty arrays.
Be thorough - look for full names, company names, abbreviations, titles (Mr., Dr., CEO of X), etc.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { entities: [], people: [], organizations: [], count: 0, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const entities = parsed.entities || [];

      // Calculate overall confidence based on individual entity confidences
      const avgConfidence = entities.length > 0
        ? entities.reduce((sum: number, e: any) => sum + (e.confidence || 0.8), 0) / entities.length
        : 0.5;

      return {
        value: {
          entities: entities,
          people: parsed.people || [],
          organizations: parsed.organizations || [],
          count: entities.length,
          model: MODEL_NAME
        },
        confidence: avgConfidence,
        reasoning: parsed.reasoning || `Extracted ${entities.length} named entities from text`
      };
    } catch (error) {
      console.error('Extraction error:', error);
      return {
        value: { entities: [], people: [], organizations: [], count: 0, error: String(error) },
        confidence: 0,
        reasoning: 'Extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new EntityExtractorAgent();
  const port = parseInt(process.env.AGENT_PORT || '50302', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
