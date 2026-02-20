/**
 * Translator Agent
 *
 * Translates text from source language to target language.
 * This is the primary translation that will be returned to the user.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'translator';
const AGENT_NAME = 'Translator';

class TranslatorAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['translation', 'translate', 'language', 'localization'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Translates text between languages with high fidelity'
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

    const prompt = `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}.

ORIGINAL TEXT (${sourceLanguage}):
"""
${text}
"""

Guidelines:
1. Preserve the meaning and tone of the original
2. Use natural, fluent ${targetLanguage} - avoid literal translations that sound awkward
3. Maintain formatting (paragraphs, lists, etc.)
4. Keep proper nouns and technical terms as appropriate for the target language

You MUST respond in this exact JSON format:
{
  "translation": "<the translated text>",
  "sourceLanguage": "${sourceLanguage}",
  "targetLanguage": "${targetLanguage}",
  "notes": "<any translator notes about choices made, idioms adapted, etc.>"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse response', checkType: 'translation' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        value: {
          translation: parsed.translation,
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage,
          notes: parsed.notes || '',
          checkType: 'translation',
          model: MODEL_NAME
        },
        confidence: 0.90,
        reasoning: `Translated ${text.length} characters from ${sourceLanguage} to ${targetLanguage}`
      };
    } catch (error) {
      console.error('Translation error:', error);
      return {
        value: { error: String(error), checkType: 'translation' },
        confidence: 0,
        reasoning: 'Translation failed'
      };
    }
  }
}

async function main() {
  const agent = new TranslatorAgent();
  const port = parseInt(process.env.AGENT_PORT || '50500', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
