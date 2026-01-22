/**
 * Quality Checker Agent
 *
 * Evaluates translation quality independently by:
 * 1. Translating the text and assessing fluency
 * 2. Checking for natural vs. "translationese" phrasing
 * 3. Evaluating grammar and style
 * 4. Identifying potential cultural/context issues
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'quality-checker';
const AGENT_NAME = 'Quality Checker';

class QualityAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['translation', 'quality', 'fluency', 'grammar'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Evaluates translation fluency and naturalness'
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

    const text = data?.text || '';
    const sourceLanguage = data?.sourceLanguage || 'English';
    const targetLanguage = data?.targetLanguage || 'Spanish';

    // First, produce a translation
    const translatePrompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Return ONLY the translation, nothing else.

TEXT:
${text}`;

    let translation = '';
    try {
      const translateResult = await this.model.generateContent(translatePrompt);
      translation = translateResult.response.text().trim();
    } catch (error) {
      console.error('Translation failed:', error);
      return {
        value: { error: 'Translation failed', checkType: 'quality' },
        confidence: 0,
        reasoning: 'Quality check failed - could not produce translation'
      };
    }

    // Now evaluate the translation quality
    const qualityPrompt = `You are a professional ${targetLanguage} language expert. Evaluate the quality of this translation.

ORIGINAL (${sourceLanguage}):
"""
${text}
"""

TRANSLATION (${targetLanguage}):
"""
${translation}
"""

Evaluate on these criteria:
1. **Fluency**: Does it read naturally in ${targetLanguage}? (not literal "translationese")
2. **Grammar**: Is the grammar correct?
3. **Style**: Does it match the tone and register of the original?
4. **Completeness**: Is all information preserved?
5. **Cultural Fit**: Are idioms and cultural references adapted appropriately?

You MUST respond in this exact JSON format:
{
  "passed": <true if overall quality is good, false if significant issues>,
  "overallScore": <0.0 to 1.0>,
  "scores": {
    "fluency": <0.0 to 1.0>,
    "grammar": <0.0 to 1.0>,
    "style": <0.0 to 1.0>,
    "completeness": <0.0 to 1.0>,
    "culturalFit": <0.0 to 1.0>
  },
  "issues": [
    {
      "type": "<fluency|grammar|style|completeness|cultural>",
      "severity": "<minor|moderate|major>",
      "description": "<what's wrong>",
      "suggestion": "<how to fix>"
    }
  ],
  "strengths": ["<positive aspects>"],
  "reasoning": "<overall assessment>"
}`;

    try {
      const qualityResult = await this.model.generateContent(qualityPrompt);
      const qualityText = qualityResult.response.text();

      // Extract JSON from response
      const jsonMatch = qualityText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse quality assessment', checkType: 'quality' },
          confidence: 0.3,
          reasoning: qualityText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const overallScore = Math.max(0, Math.min(1, parsed.overallScore || 0));
      const passed = overallScore >= 0.75;

      return {
        value: {
          passed: passed,
          overallScore: overallScore,
          scores: parsed.scores || {},
          issues: parsed.issues || [],
          strengths: parsed.strengths || [],
          translation: translation,
          checkType: 'quality',
          model: MODEL_NAME
        },
        confidence: overallScore,
        reasoning: parsed.reasoning || `Quality score: ${Math.round(overallScore * 100)}%`
      };
    } catch (error) {
      console.error('Quality check error:', error);
      return {
        value: { error: String(error), checkType: 'quality' },
        confidence: 0,
        reasoning: 'Quality check failed'
      };
    }
  }
}

async function main() {
  const agent = new QualityAgent();
  const port = parseInt(process.env.AGENT_PORT || '50502', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
