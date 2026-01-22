/**
 * Action Items Agent
 *
 * Identifies action items, tasks, decisions, and follow-ups from documents.
 * Extracts who needs to do what by when.
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.0-flash';
const AGENT_ID = 'actions-agent';
const AGENT_NAME = 'Action Items Agent';

class ActionsAgent extends ParallaxAgent {
  private model: any = null;

  constructor() {
    super(
      AGENT_ID,
      AGENT_NAME,
      ['document', 'analysis', 'actions', 'tasks', 'todos'],
      {
        expertise: 0.90,
        model: MODEL_NAME,
        description: 'Extracts action items and tasks from documents'
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

    const prompt = `You are an expert at identifying action items in documents. Extract all tasks, action items, decisions needed, and follow-ups from this document.

DOCUMENT:
"""
${document}
"""

Identify:
1. Explicit action items (things that need to be done)
2. Decisions that need to be made
3. Follow-up items or next steps
4. Deadlines or timeframes mentioned

Also rate your confidence (0-100) based on:
- How explicitly were action items stated?
- Were owners and deadlines clearly specified?
- Were there implied actions that might be missed?

You MUST respond in this exact JSON format:
{
  "actionItems": [
    {
      "action": "<what needs to be done>",
      "owner": "<who is responsible, or 'Unassigned' if not specified>",
      "deadline": "<when, or 'Not specified' if not mentioned>",
      "priority": "<high/medium/low based on context>"
    }
  ],
  "decisions": [
    {
      "decision": "<decision that needs to be made>",
      "stakeholders": "<who needs to be involved>"
    }
  ],
  "followUps": ["<follow-up items or next steps>"],
  "hasUrgentItems": <true if any items appear time-sensitive>,
  "totalActions": <total number of action items>,
  "confidence": <0-100>
}

If no action items are found, return empty arrays.`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          value: { error: 'Could not parse response', analysisType: 'actions' },
          confidence: 0.3,
          reasoning: responseText.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const totalActions = parsed.actionItems?.length || 0;
      const confidence = Math.max(0, Math.min(1, (parsed.confidence || 80) / 100));

      return {
        value: {
          ...parsed,
          totalActions: totalActions,
          analysisType: 'actions',
          model: MODEL_NAME
        },
        confidence: confidence,
        reasoning: `Found ${totalActions} action items in document (${Math.round(confidence * 100)}% confident)`
      };
    } catch (error) {
      console.error('Action extraction error:', error);
      return {
        value: { error: String(error), analysisType: 'actions' },
        confidence: 0,
        reasoning: 'Action extraction failed'
      };
    }
  }
}

async function main() {
  const agent = new ActionsAgent();
  const port = parseInt(process.env.AGENT_PORT || '50602', 10);

  await serveAgent(agent, port);

  console.log(`${AGENT_NAME} running on port ${port}`);
  console.log('Press Ctrl+C to stop');
}

main().catch(console.error);
