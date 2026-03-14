export interface Trigger {
  id: string;
  name: string;
  type: 'webhook' | 'event';
  patternName: string;
  description?: string;
  status: string;
  webhookPath?: string;
  webhookUrl?: string;
  secret?: string;
  eventType?: string;
  eventFilter?: Record<string, unknown>;
  inputMapping?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface TriggerListResponse {
  triggers: Trigger[];
  count: number;
}

export interface TriggerListParams {
  type?: 'webhook' | 'event';
  status?: string;
  patternName?: string;
  limit?: number;
  offset?: number;
}

export interface WebhookTriggerCreateInput {
  name: string;
  patternName: string;
  description?: string;
  secret?: string;
  inputMapping?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EventTriggerCreateInput {
  name: string;
  patternName: string;
  description?: string;
  eventType: string;
  eventFilter?: Record<string, unknown>;
  inputMapping?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TriggerUpdateInput {
  name?: string;
  patternName?: string;
  description?: string;
  secret?: string;
  eventType?: string;
  eventFilter?: Record<string, unknown>;
  inputMapping?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WebhookReceiverResponse {
  triggered: boolean;
  executionId?: string;
  error?: string;
}
