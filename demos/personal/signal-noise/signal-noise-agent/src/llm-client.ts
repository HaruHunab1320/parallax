import { GoogleGenerativeAI } from '@google/generative-ai';

export interface LLMRequest {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  confidence: number;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY not set — LLM calls will fail');
}
const genAI = new GoogleGenerativeAI(apiKey || '');

/**
 * Generate a response using Gemini API.
 * Confidence is derived heuristically based on domain keyword overlap.
 */
export async function generateResponse(
  request: LLMRequest,
  knowledgeKeywords: string[]
): Promise<LLMResponse> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: request.systemPrompt,
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature ?? 0.8,
    },
  });

  // Convert message history to Gemini format
  const history = request.messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  const lastMessage = request.messages[request.messages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  const content = result.response.text();

  // Heuristic confidence: check if response touches known domain
  const lowerContent = content.toLowerCase();
  const lowerPrompt = request.messages
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();

  const domainHits = knowledgeKeywords.filter(
    (kw) => lowerContent.includes(kw) || lowerPrompt.includes(kw)
  );

  let confidence: number;
  if (domainHits.length >= 3) {
    confidence = 0.85 + Math.random() * 0.1; // 0.85-0.95
  } else if (domainHits.length >= 1) {
    confidence = 0.65 + Math.random() * 0.15; // 0.65-0.80
  } else {
    confidence = 0.4 + Math.random() * 0.2; // 0.40-0.60
  }

  return { content, confidence: Math.round(confidence * 100) / 100 };
}
