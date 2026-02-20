/**
 * Sentiment Agent
 *
 * Analyzes the tone, sentiment, and emotional content of documents.
 * Identifies the overall mood and any concerning language.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'sentiment-agent';
const AGENT_NAME = 'Sentiment Agent';

class SentimentAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['document', 'analysis', 'sentiment', 'tone'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Analyzes document tone and sentiment'
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

    const prompt = `You are an expert at analyzing the tone and sentiment of written documents. Analyze the following document.

DOCUMENT:
"""
${document}
"""

Analyze:
1. Overall sentiment (positive, negative, neutral, mixed)
2. Tone (formal, informal, urgent, friendly, concerned, etc.)
3. Emotional indicators or concerning language
4. Confidence level and professionalism

Also rate your confidence (0-100) based on:
- How clear was the sentiment signal?
- Were there mixed or contradictory tones?
- How much text was available to analyze?

You MUST respond in this exact JSON format:
{
  "overallSentiment": "<positive/negative/neutral/mixed>",
  "sentimentScore": <-1.0 to 1.0, where -1 is very negative, 0 is neutral, 1 is very positive>,
  "tone": {
    "primary": "<main tone: formal, informal, urgent, friendly, concerned, etc.>",
    "secondary": ["<other tones present>"]
  },
  "emotionalIndicators": [
    {
      "emotion": "<emotion detected>",
      "intensity": "<low/medium/high>",
      "context": "<what triggered this assessment>"
    }
  ],
  "concerns": ["<any concerning language or red flags>"],
  "professionalism": {
    "score": <0.0 to 1.0>,
    "notes": "<observations about professionalism>"
  },
  "recommendation": "<any suggestions based on sentiment analysis>",
  "confidence": <0-100>
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse response', analysisType: 'sentiment' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const confidence = Math.max(0, Math.min(1, (parsed.confidence || 80) / 100));

      return {
        value: {
          ...parsed,
          analysisType: 'sentiment',
          model: MODEL_NAME
        },
        confidence: confidence,
        reasoning: `Document sentiment: ${parsed.overallSentiment} (${Math.round(confidence * 100)}% confident)`
      };
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return {
        value: { error: String(error), analysisType: 'sentiment' },
        confidence: 0,
        reasoning: 'Sentiment analysis failed'
      };
    }
  }
}

async function main() {
  const agent = new SentimentAgent();
  const port = parseInt(process.env.AGENT_PORT || '50603', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
