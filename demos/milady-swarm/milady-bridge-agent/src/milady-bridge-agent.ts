import { ParallaxAgent } from '@parallaxai/sdk-typescript';
import type { AgentResponse } from '@parallaxai/sdk-typescript';
import pino from 'pino';
import { MiladyClient } from './milady-client';
import type { MiladyTask } from './types';

const logger = pino({ name: 'milady-bridge-agent' });

const ACTION_PROMPTS: Record<string, (task: MiladyTask) => string> = {
  generate_strategy: (t) =>
    `You are the content strategist. Generate a detailed content strategy for the following campaign topic.\n\nTopic: ${t.topic}\n${t.context ? `\nAdditional context: ${t.context}` : ''}\n\nProvide:\n1. Key talking points (3-5)\n2. Thread outline for the poster\n3. Engagement themes for community interaction\n4. Amplification targets (accounts/hashtags to engage with)\n5. Tone and timing recommendations`,

  post_thread: (t) =>
    `Craft and post a Twitter/X thread about the following topic. Make it engaging, punchy, and shareable.\n\nTopic: ${t.topic}\n${t.context ? `\nStrategy context: ${t.context}` : ''}${t.style ? `\nStyle: ${t.style}` : ''}\n\nWrite a thread of 3-5 tweets. Post it.`,

  quote_tweet: (t) =>
    `Quote tweet the following with your own commentary. Add value and amplify the signal.\n\nTarget: ${t.targetUrl}\n${t.context ? `\nContext: ${t.context}` : ''}${t.style ? `\nStyle: ${t.style}` : ''}`,

  reply: (t) =>
    `Reply to the following tweet/conversation. Be engaging and add to the discussion.\n\nTarget: ${t.targetUrl}\n${t.context ? `\nContext: ${t.context}` : ''}${t.style ? `\nStyle: ${t.style}` : ''}`,

  engage: (t) =>
    `Engage with the community around the following topic. Search for relevant conversations, reply thoughtfully, and build connections.\n\nTopic: ${t.topic}\n${t.context ? `\nStrategy context: ${t.context}` : ''}`,

  search_engage: (t) =>
    `Search Twitter/X for conversations about the following topic and engage with the most relevant ones. Like, reply, and build presence.\n\nTopic: ${t.topic}\n${t.context ? `\nStrategy context: ${t.context}` : ''}`,
};

export class MiladyBridgeAgent extends ParallaxAgent {
  private readonly client: MiladyClient;
  private readonly role: string;

  constructor(
    id: string,
    name: string,
    role: string,
    client: MiladyClient
  ) {
    const capabilities = MiladyBridgeAgent.capabilitiesForRole(role);
    super(id, name, capabilities, { role, type: 'milady-bridge' });
    this.client = client;
    this.role = role;
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    const miladyTask = this.parseTask(task, data);

    logger.info(
      { agentId: this.id, role: this.role, action: miladyTask.action },
      'Processing task'
    );

    const prompt = this.buildPrompt(miladyTask);

    try {
      const response = await this.client.chat(prompt);

      logger.info(
        { agentId: this.id, agentName: response.agentName, responseLength: response.text.length },
        'Milady responded'
      );

      const confidence = this.scoreConfidence(miladyTask.action, response.text);

      return this.createResult(
        {
          action: miladyTask.action,
          response: response.text,
          agentName: response.agentName,
        },
        confidence,
        `${this.role} executed ${miladyTask.action}: ${response.text.slice(0, 100)}...`
      );
    } catch (error: any) {
      logger.error(
        { agentId: this.id, error: error.message },
        'Milady request failed'
      );

      return this.createResult(
        { action: miladyTask.action, error: error.message },
        0.3,
        `Failed to execute ${miladyTask.action}: ${error.message}`
      );
    }
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    message?: string;
  }> {
    const healthy = await this.client.healthCheck();
    return healthy
      ? { status: 'healthy' }
      : { status: 'unhealthy', message: 'Milady instance not responding' };
  }

  private parseTask(task: string, data?: any): MiladyTask {
    if (data?.action) {
      return data as MiladyTask;
    }

    // Fall back to treating the whole task string as a free-form prompt
    return {
      action: this.defaultActionForRole(),
      topic: task,
      context: data?.context,
      targetUrl: data?.targetUrl,
      style: data?.style,
    };
  }

  private buildPrompt(task: MiladyTask): string {
    const builder = ACTION_PROMPTS[task.action];
    if (builder) {
      return builder(task);
    }
    return task.topic || 'No task provided';
  }

  private scoreConfidence(action: string, response: string): number {
    if (!response || response.length < 10) return 0.3;

    // Check if the response mentions the action type or contains substance
    const actionKeywords: Record<string, string[]> = {
      generate_strategy: ['talking point', 'strategy', 'thread', 'engagement', 'amplif'],
      post_thread: ['thread', 'tweet', 'post', '1/', '🧵'],
      quote_tweet: ['quote', 'QT', 'RT'],
      reply: ['reply', 'replied', 'response'],
      engage: ['engage', 'conversation', 'community', 'replied'],
      search_engage: ['found', 'search', 'engage', 'conversation'],
    };

    const keywords = actionKeywords[action] || [];
    const lowerResponse = response.toLowerCase();
    const hasRelevantContent = keywords.some((kw) =>
      lowerResponse.includes(kw.toLowerCase())
    );

    if (hasRelevantContent && response.length > 50) return 0.9;
    if (response.length > 50) return 0.7;
    return 0.5;
  }

  private defaultActionForRole(): MiladyTask['action'] {
    switch (this.role) {
      case 'strategist':
        return 'generate_strategy';
      case 'poster':
        return 'post_thread';
      case 'engager':
        return 'engage';
      case 'amplifier':
        return 'quote_tweet';
      default:
        return 'engage';
    }
  }

  private static capabilitiesForRole(role: string): string[] {
    const base = ['social_media', 'twitter'];
    switch (role) {
      case 'strategist':
        return [...base, 'content_strategy', 'campaign_planning'];
      case 'poster':
        return [...base, 'thread_crafting', 'content_creation'];
      case 'engager':
        return [...base, 'community_engagement', 'conversation'];
      case 'amplifier':
        return [...base, 'signal_amplification', 'quote_tweeting'];
      default:
        return base;
    }
  }
}
