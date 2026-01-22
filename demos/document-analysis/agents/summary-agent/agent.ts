/**
 * Summary Agent
 *
 * Creates a concise executive summary of the document.
 * Captures the main topic, key conclusions, and overall message.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'summary-agent';
const AGENT_NAME = 'Summary Agent';

class SummaryAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['document', 'analysis', 'summary', 'overview'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Creates executive summaries of documents'
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

    const document = data?.document || data?.text || '';
    const title = data?.title || 'Untitled Document';

    const prompt = `You are an expert at creating executive summaries. Analyze the following document and create a concise summary.

DOCUMENT TITLE: ${title}

DOCUMENT:
"""
${document}
"""

Create a summary that:
1. Captures the main topic/purpose in one sentence
2. Summarizes key points in 2-3 sentences
3. Notes the conclusion or main takeaway

Also rate your confidence (0-100) in this summary based on:
- How clear and well-structured was the document?
- How confident are you in the main topic identification?
- Were there any ambiguities?

You MUST respond in this exact JSON format:
{
  "title": "<document title or inferred title>",
  "mainTopic": "<one sentence describing the main topic/purpose>",
  "summary": "<2-3 sentence summary of key content>",
  "conclusion": "<main takeaway or conclusion>",
  "wordCount": <approximate word count of original>,
  "documentType": "<type: report, email, article, memo, proposal, etc.>",
  "confidence": <0-100>
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse response', analysisType: 'summary' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const confidence = Math.max(0, Math.min(1, (parsed.confidence || 80) / 100));

      return {
        value: {
          ...parsed,
          analysisType: 'summary',
          model: MODEL_NAME
        },
        confidence: confidence,
        reasoning: `Created executive summary for ${parsed.documentType || 'document'} (${Math.round(confidence * 100)}% confident)`
      };
    } catch (error) {
      console.error('Summary error:', error);
      return {
        value: { error: String(error), analysisType: 'summary' },
        confidence: 0,
        reasoning: 'Summary generation failed'
      };
    }
  }
}

async function main() {
  const agent = new SummaryAgent();
  const port = parseInt(process.env.AGENT_PORT || '50600', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
