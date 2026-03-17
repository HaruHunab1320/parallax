'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { TerminalPane } from './TerminalPane';
import { useThreadStream, ThreadEvent } from '@/hooks/useThreadStream';
import { cn } from '@/lib/utils';

export interface ThreadConfig {
  threadId: string;
  agentName: string;
  agentType: string;
  role: string;
}

interface TerminalGridProps {
  /** Control plane base URL */
  baseUrl: string;
  /** Execution ID */
  executionId: string;
  /** Thread configurations (defines the grid layout) */
  threads: ThreadConfig[];
  /** CSS class */
  className?: string;
}

interface ThreadState {
  status: 'idle' | 'starting' | 'running' | 'blocked' | 'completed' | 'failed';
  outputLines: string[];
  summary?: string;
}

const MAX_LINES = 500;

/**
 * 2x2 (or adaptive) terminal grid showing live output from all threads
 * in a coding swarm execution.
 */
export function TerminalGrid({
  baseUrl,
  executionId,
  threads,
  className,
}: TerminalGridProps) {
  const [threadStates, setThreadStates] = useState<Record<string, ThreadState>>(() => {
    const initial: Record<string, ThreadState> = {};
    for (const t of threads) {
      initial[t.threadId] = { status: 'idle', outputLines: [] };
    }
    return initial;
  });

  const threadIds = useMemo(() => threads.map(t => t.threadId), [threads]);

  const handleEvent = useCallback((event: ThreadEvent) => {
    const { threadId, type, data } = event;

    setThreadStates(prev => {
      const current = prev[threadId] || { status: 'idle', outputLines: [] };
      const updated = { ...current };

      switch (type) {
        case 'thread_started':
          updated.status = 'starting';
          updated.outputLines = [...current.outputLines, '--- Thread started ---'];
          break;

        case 'thread_output':
        case 'thread_message': {
          updated.status = 'running';
          // data_json contains the output text
          let text = '';
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              text = parsed.output || parsed.text || parsed.message || data.data_json;
            } catch {
              text = data.data_json;
            }
          }
          if (text) {
            const newLines = text.split('\n');
            const combined = [...current.outputLines, ...newLines];
            updated.outputLines = combined.length > MAX_LINES
              ? combined.slice(-MAX_LINES)
              : combined;
          }
          break;
        }

        case 'thread_tool_running':
          updated.status = 'running';
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              const toolName = parsed.tool || parsed.name || 'tool';
              updated.outputLines = [...current.outputLines, `[running: ${toolName}]`];
            } catch {
              // ignore
            }
          }
          break;

        case 'thread_blocked':
          updated.status = 'blocked';
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              updated.outputLines = [...current.outputLines, `[BLOCKED] ${parsed.prompt || parsed.message || ''}`];
            } catch {
              updated.outputLines = [...current.outputLines, '[BLOCKED]'];
            }
          }
          break;

        case 'thread_turn_complete':
          updated.status = 'running';
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              updated.summary = parsed.summary || parsed.message;
            } catch {
              // ignore
            }
          }
          updated.outputLines = [...current.outputLines, '--- Turn complete ---'];
          break;

        case 'thread_completed':
          updated.status = 'completed';
          updated.outputLines = [...current.outputLines, '--- Thread completed ---'];
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              updated.summary = parsed.summary || parsed.message;
            } catch {
              // ignore
            }
          }
          break;

        case 'thread_failed':
        case 'thread_error':
          updated.status = 'failed';
          if (data.data_json) {
            try {
              const parsed = JSON.parse(data.data_json);
              updated.outputLines = [...current.outputLines, `[ERROR] ${parsed.error || parsed.message || ''}`];
            } catch {
              updated.outputLines = [...current.outputLines, '[ERROR]'];
            }
          }
          break;

        case 'thread_status':
          if (data.status) {
            updated.status = data.status as ThreadState['status'];
          }
          if (data.summary) {
            updated.summary = data.summary;
          }
          break;

        default:
          break;
      }

      return { ...prev, [threadId]: updated };
    });
  }, []);

  const { connected } = useThreadStream({
    baseUrl,
    executionId,
    threadIds,
    onEvent: handleEvent,
    enabled: true,
  });

  // Adaptive grid: 1 col for 1 thread, 2 cols for 2-4, 3 cols for 5+
  const gridCols = threads.length <= 1
    ? 'grid-cols-1'
    : threads.length <= 4
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Connection status */}
      <div className="flex items-center gap-2 text-sm">
        <div className={cn(
          'w-2 h-2 rounded-full',
          connected ? 'bg-green-500' : 'bg-red-500'
        )} />
        <span className="text-gray-400">
          {connected ? 'Connected' : 'Connecting...'}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">
          {threads.length} thread{threads.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Terminal grid */}
      <div className={cn('grid gap-4', gridCols)}>
        {threads.map(thread => {
          const state = threadStates[thread.threadId] || { status: 'idle', outputLines: [] };
          return (
            <TerminalPane
              key={thread.threadId}
              threadId={thread.threadId}
              agentName={thread.agentName}
              agentType={thread.agentType}
              role={thread.role}
              status={state.status}
              summary={state.summary}
              outputLines={state.outputLines}
              className="h-[350px]"
            />
          );
        })}
      </div>
    </div>
  );
}
