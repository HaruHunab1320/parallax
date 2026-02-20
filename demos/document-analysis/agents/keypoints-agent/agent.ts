/**
 * Key Points Agent
 *
 * Extracts the most important points and takeaways from a document.
 * Identifies critical information that readers should remember.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'keypoints-agent';
const AGENT_NAME = 'Key Points Agent';

class KeyPointsAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['document', 'analysis', 'keypoints', 'extraction'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts key points and takeaways from documents'
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

    const document = data?.document || data?.text || '';

    const prompt = `You are an expert at identifying the most important information in documents. Extract the key points from this document.

DOCUMENT:
"""
${document}
"""

Extract:
1. The most critical points (things readers MUST know)
2. Supporting points (important but secondary)
3. Any data, statistics, or specific facts mentioned

Also rate your confidence (0-100) based on:
- How clearly were key points stated in the document?
- Were there ambiguous or unclear sections?
- How confident are you in the importance rankings?

You MUST respond in this exact JSON format:
{
  "criticalPoints": [
    {
      "point": "<key point>",
      "importance": "<why this matters>"
    }
  ],
  "supportingPoints": ["<additional important points>"],
  "factsAndData": [
    {
      "fact": "<specific fact, number, or statistic>",
      "context": "<what it relates to>"
    }
  ],
  "totalPoints": <number of key points extracted>,
  "confidence": <0-100>
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse response', analysisType: 'keypoints' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const totalPoints = (parsed.criticalPoints?.length || 0) +
                         (parsed.supportingPoints?.length || 0);
      const confidence = Math.max(0, Math.min(1, (parsed.confidence || 80) / 100));

      return {
        value: {
          ...parsed,
          totalPoints: totalPoints,
          analysisType: 'keypoints',
          model: MODEL_NAME
        },
        confidence: confidence,
        reasoning: `Extracted ${totalPoints} key points from document (${Math.round(confidence * 100)}% confident)`
      };
    } catch (error) {
      console.error('Key points extraction error:', error);
      return {
        value: { error: String(error), analysisType: 'keypoints' },
        confidence: 0,
        reasoning: 'Key points extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new KeyPointsAgent();
  const port = parseInt(process.env.AGENT_PORT || '50601', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
