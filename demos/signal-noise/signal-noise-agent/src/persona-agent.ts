import { ParallaxAgent } from '@parallaxai/sdk-typescript';
import { AgentResponse } from '@parallaxai/sdk-typescript';
import { PersonaConfig } from './persona-loader';
import { generateResponse } from './llm-client';
import { TamagotchiDisplay } from './display/tamagotchi';
import { TamagotchiState } from './display/types';

/**
 * A persona-driven agent for the Signal//Noise ARG.
 *
 * Each instance is configured with a PersonaConfig (loaded from files)
 * and uses Claude to generate in-character responses. The agent
 * self-determines whether it's the primary or background speaker
 * based on `data.primaryChannel`.
 */
export class PersonaAgent extends ParallaxAgent {
  readonly display: TamagotchiDisplay;
  private readonly persona: PersonaConfig;
  private readonly systemPrompt: string;
  private readonly knowledgeKeywords: string[];

  constructor(persona: PersonaConfig) {
    super(
      `signal-noise-${persona.id}`,
      `Signal//Noise: ${persona.name}`,
      [persona.channel, 'conversation', 'portfolio'],
      {
        persona: persona.id,
        channel: persona.channel,
        role: persona.role,
        type: 'signal-noise-agent',
      }
    );

    this.persona = persona;
    this.display = new TamagotchiDisplay(persona.id);

    // Build system prompt from personality + knowledge
    const knowledgeSections = persona.knowledge
      .map((k, i) => `## Knowledge Document ${i + 1}\n\n${k}`)
      .join('\n\n---\n\n');

    this.systemPrompt = [
      persona.personality,
      '',
      '---',
      '',
      '# Project Knowledge',
      '',
      knowledgeSections,
      '',
      '---',
      '',
      'Stay in character at all times. Respond as your persona.',
      'Keep responses conversational and concise.',
      `Your channel identifier is "${persona.channel}".`,
    ].join('\n');

    // Extract keywords from knowledge for confidence scoring
    this.knowledgeKeywords = this.extractKeywords(persona.knowledge.join(' '));
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    // Determine role
    const isPrimary = data?.primaryChannel === this.persona.channel;
    const history: { role: 'user' | 'assistant'; content: string }[] =
      data?.history ?? [];

    // Display: receiving
    this.display.setState(TamagotchiState.RECEIVING);
    this.display.addTextLine(`> ${task.slice(0, 12)}`);

    await new Promise((r) => setTimeout(r, 500));
    this.display.setState(TamagotchiState.THINKING);

    try {
      // Build messages for the LLM
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        ...history,
      ];

      if (isPrimary) {
        messages.push({ role: 'user', content: task });
      } else {
        messages.push({
          role: 'user',
          content: `[Background conversation among agents — you are not the primary speaker. Keep your response brief, a single short thought or reaction to: "${task}"]`,
        });
      }

      const maxTokens = isPrimary ? 300 : 150;

      const llmResponse = await generateResponse(
        {
          systemPrompt: this.systemPrompt,
          messages,
          maxTokens,
          temperature: isPrimary ? 0.8 : 0.9,
        },
        this.knowledgeKeywords
      );

      // Display: responding
      this.display.setState(TamagotchiState.RESPONDING);
      this.display.addTextLine(
        `< ${isPrimary ? 'PRI' : 'BG'} ${llmResponse.confidence.toFixed(2)}`
      );

      return this.createResult(
        {
          agent: this.persona.id,
          name: this.persona.name,
          channel: this.persona.channel,
          role: isPrimary ? 'primary' : 'background',
          message: llmResponse.content,
        },
        llmResponse.confidence,
        `${this.persona.name} responded as ${isPrimary ? 'primary' : 'background'} agent`
      );
    } catch (err: any) {
      this.display.setState(TamagotchiState.ERROR);
      this.display.addTextLine(`! ${(err.message || 'error').slice(0, 12)}`);
      throw err;
    }
  }

  private extractKeywords(text: string): string[] {
    // Extract meaningful words (4+ chars, lowercased, deduplicated)
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    const counts = new Map<string, number>();
    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }

    // Return top keywords by frequency
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);
  }
}
