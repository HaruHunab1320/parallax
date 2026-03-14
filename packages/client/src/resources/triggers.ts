import { HttpClient } from '../http.js';
import {
  Trigger,
  TriggerListResponse,
  TriggerListParams,
  WebhookTriggerCreateInput,
  EventTriggerCreateInput,
  TriggerUpdateInput,
  WebhookReceiverResponse,
} from '../types/triggers.js';

export class TriggersResource {
  constructor(private http: HttpClient) {}

  /** List all triggers (Enterprise) */
  async list(params?: TriggerListParams): Promise<TriggerListResponse> {
    return this.http.get<TriggerListResponse>('/api/triggers', {
      type: params?.type,
      status: params?.status,
      patternName: params?.patternName,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /** Create a webhook trigger (Enterprise) */
  async createWebhook(input: WebhookTriggerCreateInput): Promise<Trigger> {
    return this.http.post<Trigger>('/api/triggers/webhook', input);
  }

  /** Create an event trigger (Enterprise) */
  async createEvent(input: EventTriggerCreateInput): Promise<Trigger> {
    return this.http.post<Trigger>('/api/triggers/event', input);
  }

  /** Get a trigger by ID (Enterprise) */
  async get(id: string): Promise<Trigger> {
    return this.http.get<Trigger>(`/api/triggers/${encodeURIComponent(id)}`);
  }

  /** Update a trigger (Enterprise) */
  async update(id: string, updates: TriggerUpdateInput): Promise<Trigger> {
    return this.http.put<Trigger>(
      `/api/triggers/${encodeURIComponent(id)}`,
      updates
    );
  }

  /** Delete a trigger (Enterprise) */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/triggers/${encodeURIComponent(id)}`);
  }

  /** Pause a trigger (Enterprise) */
  async pause(id: string): Promise<Trigger> {
    return this.http.post<Trigger>(
      `/api/triggers/${encodeURIComponent(id)}/pause`
    );
  }

  /** Resume a trigger (Enterprise) */
  async resume(id: string): Promise<Trigger> {
    return this.http.post<Trigger>(
      `/api/triggers/${encodeURIComponent(id)}/resume`
    );
  }

  /** Send a webhook payload (no auth required) */
  async sendWebhook(
    path: string,
    payload: unknown
  ): Promise<WebhookReceiverResponse> {
    return this.http.post<WebhookReceiverResponse>(
      `/api/triggers/webhook/${encodeURIComponent(path)}`,
      payload
    );
  }
}
