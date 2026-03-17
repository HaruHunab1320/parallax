'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

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
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  // Keep refs in sync
  onEventRef.current = onEvent;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    let url = `${baseUrl}/api/executions/${executionId}/threads/stream`;
    if (threadIds && threadIds.length > 0) {
      url += `?threadIds=${threadIds.join(',')}`;
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      onConnectRef.current?.();
    });

    // Thread event types from the SSE endpoint
    const eventTypes = [
      'thread_output',
      'thread_blocked',
      'thread_started',
      'thread_completed',
      'thread_failed',
      'thread_turn_complete',
      'thread_status',
      'thread_error',
      'thread_message',
      'thread_tool_running',
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const event: ThreadEvent = JSON.parse(e.data);
          onEventRef.current?.(event);
        } catch {
          // Ignore parse errors
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
      onDisconnectRef.current?.();
      // EventSource auto-reconnects
    };

    return es;
  }, [baseUrl, executionId, threadIds]);

  useEffect(() => {
    if (!enabled || !executionId) return;

    const es = connect();
    return () => {
      es.close();
      setConnected(false);
    };
  }, [enabled, executionId, connect]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }
  }, []);

  return { connected, disconnect };
}
