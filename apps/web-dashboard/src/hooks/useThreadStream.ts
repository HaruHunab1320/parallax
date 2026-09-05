'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { consumeServerEvents } from '@/lib/sse';

export interface ThreadEvent {
  executionId: string;
  threadId: string;
  type: string;
  data: {
    thread_id: string;
    event_type?: string;
    data_json?: string;
    status?: string;
    summary?: string;
    progress?: number;
    timestamp_ms?: number;
    sequence?: number;
  };
  timestamp: string;
}

export interface ThreadStreamOptions {
  /** Control plane base URL */
  baseUrl: string;
  /** Execution ID to subscribe to */
  executionId: string;
  /** Optional thread ID filter */
  threadIds?: string[];
  /** Called for each thread event */
  onEvent?: (event: ThreadEvent) => void;
  /** Called on connection */
  onConnect?: () => void;
  /** Called on disconnect */
  onDisconnect?: () => void;
  /** Whether to auto-connect */
  enabled?: boolean;
}

/**
 * React hook for subscribing to thread event streams via SSE.
 */
export function useThreadStream(options: ThreadStreamOptions) {
  const {
    baseUrl,
    executionId,
    threadIds,
    onEvent,
    onConnect,
    onDisconnect,
    enabled = true,
  } = options;

  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  onEventRef.current = onEvent;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  const threadFilter = threadIds?.join(',') || '';

  useEffect(() => {
    if (!enabled || !executionId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const eventTypes = new Set([
      'thread_output', 'thread_blocked', 'thread_started', 'thread_ready',
      'thread_auth_required', 'thread_completed', 'thread_failed',
      'thread_turn_complete', 'thread_status', 'thread_error',
      'thread_message', 'thread_tool_running',
    ]);
    const connect = async () => {
      if (controller.signal.aborted) return;
      let retry = true;
      try {
        const url = new URL(`${baseUrl}/api/executions/${encodeURIComponent(executionId)}/threads/stream`, window.location.origin);
        if (threadFilter) url.searchParams.set('threadIds', threadFilter);
        const response = await apiClient.fetchAuthenticated(url.toString(), controller.signal);
        if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
          retry = response.status !== 401 && response.status !== 403;
          await response.body?.cancel();
          throw new Error(`Thread stream unavailable (${response.status})`);
        }
        await consumeServerEvents(response.body, ({ event: eventType, data }) => {
          if (controller.signal.aborted) return;
          if (eventType === 'connected') {
            attempts = 0;
            setConnected(true);
            onConnectRef.current?.();
          } else if (eventTypes.has(eventType)) {
            let event: ThreadEvent;
            try { event = JSON.parse(data); } catch { return; }
            event.type = eventType;
            onEventRef.current?.(event);
          }
        });
      } catch {
        // Authentication is handled by the shared client; transient failures reconnect.
      } finally {
        if (!controller.signal.aborted) {
          setConnected(false);
          onDisconnectRef.current?.();
          if (retry) reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
        }
      }
    };
    void connect();
    return () => {
      controller.abort();
      clearTimeout(reconnectTimer);
      if (abortRef.current === controller) abortRef.current = null;
      setConnected(false);
    };
  }, [baseUrl, executionId, enabled, threadFilter]);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConnected(false);
  }, []);

  return { connected, disconnect };
}
