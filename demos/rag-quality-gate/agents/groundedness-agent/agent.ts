/**
 * Groundedness Checker Agent
 *
 * Verifies that the generated answer is supported by the retrieved documents.
 * Catches hallucinations where the model makes up information not in the sources.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'groundedness-checker';
const AGENT_NAME = 'Groundedness Checker';

class GroundednessAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['quality-gate', 'groundedness', 'verification', 'rag'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Verifies that answers are grounded in the source documents'
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

    const question = data?.question || '';
    const answer = data?.answer || data?.generatedAnswer || '';
    const sources = data?.sources || data?.retrievedDocs || [];
    const sourcesText = Array.isArray(sources) ? sources.join('\n\n---\n\n') : sources;

    const prompt = `You are a groundedness verification agent. Your job is to check if the ANSWER is fully supported by the SOURCE DOCUMENTS.

QUESTION: ${question}

SOURCE DOCUMENTS:
"""
${sourcesText}
"""

GENERATED ANSWER:
"""
${answer}
"""

Analyze each claim in the answer and verify it against the source documents.

For each claim:
1. Is it explicitly stated in the sources?
2. Is it a reasonable inference from the sources?
3. Or is it made up / hallucinated?

You MUST respond in this exact JSON format:
{
  "passed": <true if ALL claims are grounded, false if ANY claim is hallucinated>,
  "score": <0.0 to 1.0 - percentage of claims that are grounded>,
  "claims": [
    {
      "claim": "<the claim from the answer>",
      "grounded": <true/false>,
      "source": "<quote from source that supports it, or null if not found>",
      "issue": "<explanation if not grounded, or null>"
    }
  ],
  "hallucinations": ["<list of hallucinated claims>"],
  "reasoning": "<overall assessment>"
}

Be strict - if information is not in the sources, it's a hallucination.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { passed: false, error: 'Could not parse response' },
          confidence: 0.3,
          reasoning: text.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(1, parsed.score || 0));

      return {
        value: {
          passed: parsed.passed === true,
          score: score,
          claims: parsed.claims || [],
          hallucinations: parsed.hallucinations || [],
          checkType: 'groundedness',
          model: MODEL_NAME
        },
        confidence: score,
        reasoning: parsed.reasoning || 'Groundedness check completed'
      };
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        value: { passed: false, error: String(error), checkType: 'groundedness' },
        confidence: 0,
        reasoning: 'Analysis failed'
      };
    }
  }
}

async function main() {
  const agent = new GroundednessAgent();
  const port = parseInt(process.env.AGENT_PORT || '50400', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
