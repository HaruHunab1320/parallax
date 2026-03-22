export type MiladyAction =
  | 'generate_strategy'
  | 'post_thread'
  | 'quote_tweet'
  | 'reply'
  | 'engage'
  | 'search_engage';

export interface MiladyTask {
  action: MiladyAction;
  topic?: string;
  context?: string;
  targetUrl?: string;
  style?: string;
}

export interface MiladyChatRequest {
  text: string;
}

export interface MiladyChatResponse {
  text: string;
  agentName: string;
}

export interface BridgeAgentConfig {
  id: string;
  name: string;
  role: string;
  miladyUrl: string;
  miladyToken: string;
  gatewayEndpoint: string;
  logLevel: string;
}
