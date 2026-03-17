'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TerminalPaneProps {
  /** Thread ID for this terminal */
  threadId: string;
  /** Agent display name */
  agentName: string;
  /** Agent type badge */
  agentType: 'claude' | 'codex' | 'gemini' | string;
  /** Org-chart role */
  role: string;
  /** Current thread status */
  status: 'starting' | 'running' | 'blocked' | 'completed' | 'failed' | 'idle';
  /** Status summary text */
  summary?: string;
  /** PTY output lines to render */
  outputLines: string[];
  /** CSS class */
  className?: string;
}

const agentColors: Record<string, string> = {
  claude: 'bg-orange-600',
  codex: 'bg-green-700',
  gemini: 'bg-blue-600',
};

const agentBadges: Record<string, string> = {
  claude: '\u25C6', // ◆
  codex: '\u25CF',  // ●
  gemini: '\u2605', // ★
};

const statusColors: Record<string, string> = {
  starting: 'bg-yellow-600 text-black',
  running: 'bg-green-600 text-black',
  blocked: 'bg-yellow-500 text-black',
  completed: 'bg-cyan-600 text-black',
  failed: 'bg-red-600 text-white',
  idle: 'bg-gray-600 text-white',
};

const statusLabels: Record<string, string> = {
  starting: 'STARTING...',
  running: 'RUNNING',
  blocked: 'BLOCKED',
  completed: 'DONE',
  failed: 'FAILED',
  idle: 'IDLE',
};

/**
 * A single terminal pane that renders PTY output for one thread/agent.
 * Styled to match the tmux status bar aesthetic from the Pi 5" displays.
 */
export function TerminalPane({
  threadId: _threadId,
  agentName,
  agentType,
  role,
  status,
  summary,
  outputLines,
  className,
}: TerminalPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputLines.length]);

  const badge = agentBadges[agentType] || '\u25B8';
  const headerColor = agentColors[agentType] || 'bg-gray-700';
  const statusColor = statusColors[status] || statusColors.idle;
  const statusLabel = statusLabels[status] || status.toUpperCase();

  return (
    <div className={cn('flex flex-col rounded-lg overflow-hidden border border-parallax-border', className)}>
      {/* Status bar — matches tmux style */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d]">
        <div className={cn('flex items-center gap-2 px-2 py-0.5 rounded text-sm font-bold text-white', headerColor)}>
          <span>{badge}</span>
          <span>[{agentType.toUpperCase()}]</span>
          <span>{agentName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{role}</span>
          <div className={cn('px-2 py-0.5 rounded text-xs font-bold', statusColor)}>
            {statusLabel}
          </div>
        </div>
      </div>

      {/* Terminal output area */}
      <div
        ref={scrollRef}
        className="flex-1 bg-black p-2 overflow-y-auto font-mono text-xs leading-relaxed text-green-400 min-h-[200px]"
      >
        {outputLines.length === 0 ? (
          <div className="text-gray-600 italic">
            {status === 'idle' ? 'Waiting for thread to start...' : 'Connecting...'}
          </div>
        ) : (
          outputLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        {summary && status === 'completed' && (
          <div className="mt-2 pt-2 border-t border-gray-800 text-cyan-400">
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
