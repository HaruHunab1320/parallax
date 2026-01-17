/**
 * Gemini LLM Provider using Vercel AI SDK
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { LLMProvider } from '../../types';

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
}

export class GeminiProvider implements LLMProvider {
  private client: ReturnType<typeof createGoogleGenerativeAI>;
  private model: string;

  constructor(options: GeminiProviderOptions) {
    this.client = createGoogleGenerativeAI({
      apiKey: options.apiKey,
    });
    this.model = options.model || 'gemini-3-pro-preview';
  }

  async generateObject<T>({ 
    schema, 
    prompt, 
    system 
  }: { 
    schema: z.ZodSchema<T>; 
    prompt: string; 
    system?: string 
  }): Promise<{ object: T }> {
    try {
      const result = await generateObject({
        model: this.client(this.model),
        schema,
        prompt,
        system,
        temperature: 0.7,
        maxTokens: 2000,
      });

      return { object: result.object };
    } catch (error) {
      console.error('Gemini generation error:', error);
      throw new Error(`Failed to generate object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Create Gemini provider from environment variables
 */
export function createGeminiProvider(apiKey?: string, model?: string): GeminiProvider {
  const key = apiKey || process.env.GEMINI_API_KEY;
  
  if (!key) {
    throw new Error('Gemini API key not found. Set GEMINI_API_KEY environment variable or pass apiKey parameter.');
  }

  return new GeminiProvider({
    apiKey: key,
    model: model || 'gemini-3-pro-preview',
  });
}
