/**
 * Round-Trip Verifier Agent
 *
 * Performs round-trip translation verification:
 * 1. Translates text to target language
 * 2. Translates back to source language
 * 3. Compares original with back-translated text
 * 4. Reports semantic similarity score
 *
 * High similarity (>85%) = translation preserves meaning
 * Low similarity (<85%) = potential meaning loss, flag for review
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'roundtrip-verifier';
const AGENT_NAME = 'Round-Trip Verifier';

class RoundTripAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['translation', 'verification', 'roundtrip', 'quality'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Verifies translation quality via round-trip translation'
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

    const text = data?.text || '';
    const sourceLanguage = data?.sourceLanguage || 'English';
    const targetLanguage = data?.targetLanguage || 'Spanish';

    // Step 1: Translate to target language
    const forwardPrompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Return ONLY the translation, nothing else.

TEXT:
${text}`;

    let forwardTranslation = '';
    try {
      const forwardResult = await this.model.generateContent(forwardPrompt);
      forwardTranslation = forwardResult.response.text().trim();
    } catch (error) {
      console.error('Forward translation failed:', error);
      return {
        value: { error: 'Forward translation failed', checkType: 'roundtrip' },
        confidence: 0,
        reasoning: 'Round-trip verification failed at forward step'
      };
    }

    // Step 2: Translate back to source language
    const backPrompt = `Translate the following text from ${targetLanguage} to ${sourceLanguage}. Return ONLY the translation, nothing else.

TEXT:
${forwardTranslation}`;

    let backTranslation = '';
    try {
      const backResult = await this.model.generateContent(backPrompt);
      backTranslation = backResult.response.text().trim();
    } catch (error) {
      console.error('Back translation failed:', error);
      return {
        value: { error: 'Back translation failed', checkType: 'roundtrip' },
        confidence: 0,
        reasoning: 'Round-trip verification failed at back-translation step'
      };
    }

    // Step 3: Compare original with back-translated
    const comparisonPrompt = `Compare the semantic meaning of these two texts and determine their similarity.

ORIGINAL TEXT:
"""
${text}
"""

BACK-TRANSLATED TEXT:
"""
${backTranslation}
"""

Analyze:
1. Do they convey the same core meaning?
2. Are there any significant meaning differences?
3. Are there any nuances lost or changed?

You MUST respond in this exact JSON format:
{
  "similarity": <0.0 to 1.0 - semantic similarity score>,
  "passed": <true if similarity >= 0.85, false otherwise>,
  "meaningPreserved": <true/false - is the core meaning intact?>,
  "differences": ["<list of any meaning differences>"],
  "lostNuances": ["<list of any nuances that were lost>"],
  "reasoning": "<explanation of the comparison>"
}`;

    try {
      const comparisonResult = await this.model.generateContent(comparisonPrompt);
      const comparisonText = comparisonResult.response.text();

      // Extract JSON from response
      const jsonMatch = comparisonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse comparison', checkType: 'roundtrip' },
          confidence: 0.3,
          reasoning: comparisonText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const similarity = Math.max(0, Math.min(1, parsed.similarity || 0));
      const passed = similarity >= 0.85;

      return {
        value: {
          passed: passed,
          similarity: similarity,
          forwardTranslation: forwardTranslation,
          backTranslation: backTranslation,
          meaningPreserved: parsed.meaningPreserved !== false,
          differences: parsed.differences || [],
          lostNuances: parsed.lostNuances || [],
          checkType: 'roundtrip',
          model: MODEL_NAME
        },
        confidence: similarity,
        reasoning: parsed.reasoning || `Round-trip similarity: ${Math.round(similarity * 100)}%`
      };
    } catch (error) {
      console.error('Comparison error:', error);
      return {
        value: { error: String(error), checkType: 'roundtrip' },
        confidence: 0,
        reasoning: 'Comparison failed'
      };
    }
  }
}

async function main() {
  const agent = new RoundTripAgent();
  const port = parseInt(process.env.AGENT_PORT || '50501', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
